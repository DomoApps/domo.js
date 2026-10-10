// Pure release-decision logic for the ryuu.js pipeline. No I/O: release.ts gathers
// state from npm, git and Jira and hands it in. See RELEASING.md for the model.
//
// Stages: X.Y.Z-beta.N (npm `beta`) → X.Y.Z-rc.N (npm `rc`) → X.Y.Z (npm `latest`).

/** A line's first beta must be this old before it can become an rc... */
export const BETA_SOAK_DAYS = 7;
/** ...and its newest beta this old, so the latest change has soaked too... */
export const BETA_QUIET_DAYS = 3;
/** ...unless the first beta is this old, when the newest is promoted regardless, so steady merging can't starve a release. */
export const BETA_MAX_DAYS = 14;
export const RC_SOAK_DAYS = 7;
/** A run that lands within this long of a soak's end counts as ripe (cron jitter, publish latency). */
export const SOAK_GRACE_DAYS = 1 / 24;
/** A merged PR with this label sends its release straight to latest. */
export const HOTFIX_LABEL = 'release:hotfix';
/** Repository roles whose application of HOTFIX_LABEL counts. */
export const HOTFIX_ROLES = ['admin', 'maintain'];
export const NON_BUG_RESOLUTIONS = ['duplicate', "won't do", "won't fix", 'cannot reproduce', 'not a bug'];

const DAY_MS = 86_400_000;
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-(beta|rc)\.(\d+))?$/;

export type Pre = 'beta' | 'rc';

export interface Parsed {
  base: string;
  major: number;
  minor: number;
  patch: number;
  pre: Pre | null;
  num: number | null;
}

export interface TagInfo {
  sha: string;
  parent: string;
  /** Set when the tag's annotation marks it as part of a hotfix release. */
  hotfix?: boolean;
}

export interface State {
  now: Date;
  masterVersion: string;
  masterSha: string;
  npm: {
    versions: string[];
    time: Record<string, string>;
    distTags: Record<string, string>;
  };
  /** Pipeline-format tags, keyed by version without the leading `v`. */
  tags: Record<string, TagInfo>;
}

export interface JiraIssue {
  key: string;
  created: string;
  statusCategory: string;
  resolution: string | null;
}

/** Returns the keys of bugs that block the given labels since `since`. Throws if Jira can't be read. */
export type BugCheck = (labels: string[], since: Date) => Promise<string[]>;

/** Whether a merged PR in `from..to` (or just `to` when `from` is null) carries HOTFIX_LABEL. */
export type HotfixCheck = (from: string | null, to: string) => Promise<boolean>;

export type Action =
  | { kind: 'none'; reason: string }
  | { kind: 'publish'; version: string; reason: string }
  | { kind: 'beta'; version: string; from: string; compare: string | null; hotfix: boolean; reason: string }
  | { kind: 'rc'; version: string; from: string; compare: string; hotfix: boolean; reason: string }
  | { kind: 'ga'; version: string; from: string; compare: string; hotfix: boolean; reason: string };

export interface PlanOptions {
  forceRc?: boolean;
  forceGa?: boolean;
}

/** Parses `X.Y.Z`, `X.Y.Z-beta.N` or `X.Y.Z-rc.N`; anything else (alphas, legacy formats) is null. */
export function parse(v: string): Parsed | null {
  const m = VERSION_RE.exec(v);
  if (!m) return null;
  return {
    base: `${m[1]}.${m[2]}.${m[3]}`,
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: (m[4] as Pre | undefined) ?? null,
    num: m[5] === undefined ? null : Number(m[5]),
  };
}

export interface TagRef {
  version: string;
  sha: string;
  hotfix: boolean;
}

/**
 * Parses `git for-each-ref refs/tags --format='%(refname:short)<TAB>%(objecttype)<TAB>%(objectname)<TAB>
 * %(*objectname)<TAB>%(contents:subject)'`. prepare-release.sh writes "(hotfix)" at the end of the annotation of
 * every tag in a hotfix release; lightweight tags can never carry the marker.
 */
export function parseTagRefs(output: string): TagRef[] {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'))
    .filter(([name]) => name.startsWith('v') && parse(name.slice(1)) !== null)
    .map(([name, type, obj, peeled, subject]) => ({
      version: name.slice(1),
      sha: peeled || obj,
      hotfix: type === 'tag' && /\(hotfix\)\s*$/.test(subject ?? ''),
    }));
}

/** Lenient `X.Y.Z` prefix, used for master's package.json version floor. */
export function baseOf(v: string): string | null {
  const m = /^(\d+\.\d+\.\d+)/.exec(v);
  return m ? m[1] : null;
}

/** Semver order for pipeline versions: beta < rc < GA within the same X.Y.Z. */
export function cmp(a: string, b: string): number {
  const pa = mustParse(a);
  const pb = mustParse(b);
  return (
    pa.major - pb.major ||
    pa.minor - pb.minor ||
    pa.patch - pb.patch ||
    rank(pa) - rank(pb) ||
    (pa.num ?? 0) - (pb.num ?? 0)
  );
}

/** The `simulate_now` dry-run input: `+Nd` from the real clock, an ISO timestamp, or empty. */
export function simulatedNow(input: string, real: Date): Date {
  if (!input) return real;
  const offset = /^\+(\d+(?:\.\d+)?)d$/.exec(input);
  if (offset) return new Date(real.getTime() + Number(offset[1]) * DAY_MS);
  const at = new Date(input);
  if (/^\d{4}-\d{2}-\d{2}/.test(input) && !Number.isNaN(at.getTime())) return at;
  throw new Error(`simulate_now must be +Nd or an ISO timestamp, got "${input}"`);
}

/**
 * The X.Y.Z that new merges ship as betas: the line after the newest rc or GA, master's floor, or a
 * published beta line that is already higher (lowering the floor never moves the pipeline backwards).
 */
export function activeBase(s: State): string {
  const all = known(s);
  const finished = all.filter((v) => mustParse(v).pre !== 'beta');
  const betas = all.filter((v) => mustParse(v).pre === 'beta').map((v) => mustParse(v).base);
  const next = finished.length ? nextPatch(finished[finished.length - 1]) : null;
  const floor = baseOf(s.masterVersion);
  const highestBeta = betas.length ? betas.sort(cmp)[betas.length - 1] : null;
  const candidates = [next, floor, highestBeta].filter((v): v is string => v !== null).sort(cmp);
  if (!candidates.length) throw new Error(`no released versions and no usable master version (${s.masterVersion})`);
  return candidates[candidates.length - 1];
}

/**
 * One past every `pre` number npm or git has ever seen for `base` (npm never reuses a version), and past the
 * version master's package.json already says, which a release commit could not change.
 */
export function nextNumber(base: string, pre: Pre, s: State): number {
  const seen = [...s.npm.versions, ...Object.keys(s.npm.time), ...Object.keys(s.tags), s.masterVersion]
    .map(parse)
    .filter((p): p is Parsed => p !== null && p.base === base && p.pre === pre)
    .map((p) => p.num as number);
  return seen.length ? Math.max(...seen) + 1 : 0;
}

/** A pipeline tag that was pushed but never reached npm (e.g. the publish run failed). */
export function pendingPublish(s: State): string | null {
  // Compare with the highest published GA, not the highest version of any kind: while an rc soaks, the next
  // line's betas are already on npm, and a failed GA publish must still be retried.
  const publishedGa = newest(sorted(s.npm.versions).filter((v) => mustParse(v).pre === null));
  const pending = sorted(releaseTags(s)).filter(
    (v) => !(v in s.npm.time) && !s.npm.versions.includes(v) && (!publishedGa || cmp(v, publishedGa) > 0),
  );
  return pending[0] ?? null;
}

/**
 * At most one irreversible step per run, in priority order: finish a pending publish, manual overrides,
 * hotfixes (which skip every soak and never consult Jira), release a soaked rc as latest, promote a soaked
 * beta to rc, cut a beta from master.
 */
export async function planRelease(
  s: State,
  bugs: BugCheck,
  o: PlanOptions = {},
  isHotfix: HotfixCheck = async () => false,
): Promise<Action> {
  const pending = pendingPublish(s);
  if (pending) return { kind: 'publish', version: pending, reason: `v${pending} is tagged but not on npm` };

  const line = activeBase(s);
  const rcs = gaCandidates(s);
  const betas = stage(line, 'beta', s.npm.versions).filter((v) => s.tags[v]);
  const beta = newest(betas);
  const shippedSha = lastShippedMasterSha(line, s);
  const unreleased = shippedSha !== s.masterSha;

  const toRc = (reason: string): Action => ({
    kind: 'rc',
    version: `${line}-rc.${nextNumber(line, 'rc', s)}`,
    from: `v${beta}`,
    compare: beta as string,
    hotfix: Boolean(beta && s.tags[beta].hotfix),
    reason,
  });
  const toBeta = (hotfix: boolean, reason: string): Action => ({
    kind: 'beta',
    version: `${line}-beta.${nextNumber(line, 'beta', s)}`,
    from: s.masterSha,
    compare: beta ?? newest(sorted(s.npm.versions).filter((v) => mustParse(v).pre !== 'beta')),
    hotfix,
    reason,
  });

  // Manual overrides
  if (o.forceGa) {
    return rcs.length
      ? ga(rcs[0], s, `force_ga: releasing ${rcs[0]}`)
      : { kind: 'none', reason: 'force_ga: no rc to release' };
  }
  if (o.forceRc) {
    return beta ? toRc(`force_rc: promoting ${beta}`) : { kind: 'none', reason: 'force_rc: no beta to promote' };
  }

  // Hotfixes. A lookup failure fails the run: cutting a normal beta would lose the hotfix for good.
  const hotRc = rcs.find((rc) => s.tags[rc].hotfix);
  if (hotRc) return ga(hotRc, s, `hotfix: releasing ${hotRc}`);
  if (beta && s.tags[beta].hotfix) return toRc(`hotfix: promoting ${beta}`);
  if (unreleased && (await isHotfix(shippedSha, s.masterSha))) {
    return toBeta(true, `master ${s.masterSha.slice(0, 7)} has unreleased commits from a ${HOTFIX_LABEL} PR`);
  }

  const notes: string[] = [];

  // rc → latest
  for (const rc of rcs) {
    const since = new Date(s.npm.time[rc]);
    const days = ageDays(s, since);
    if (!ripe(days, RC_SOAK_DAYS)) {
      notes.push(`${rc} has soaked ${days.toFixed(1)}/${RC_SOAK_DAYS} days`);
      continue;
    }
    const found = await bugs(labelsFor(mustParse(rc).base, s), since);
    if (!found.length) return ga(rc, s, `${rc} soaked ${days.toFixed(1)} days with no bugs`);
    notes.push(`${rc} blocked by ${found.join(', ')}`);
  }

  // beta → rc. The first-beta clock never restarts, and past BETA_MAX_DAYS the quiet period is waived,
  // so steady merging can't hold a line back forever.
  if (beta) {
    const since = new Date(s.npm.time[beta]);
    const firstDays = ageDays(s, new Date(s.npm.time[betas[0]]));
    const quietDays = ageDays(s, since);
    const eligible =
      ripe(firstDays, BETA_MAX_DAYS) || (ripe(firstDays, BETA_SOAK_DAYS) && ripe(quietDays, BETA_QUIET_DAYS));
    if (eligible) {
      const found = await bugs(labelsFor(line, s), since);
      if (!found.length) {
        return toRc(`${line} in beta ${firstDays.toFixed(1)} days, ${beta} quiet ${quietDays.toFixed(1)} days, no bugs`);
      }
      notes.push(`rc of ${line} blocked by ${found.join(', ')}`);
    } else {
      notes.push(
        `${line} in beta ${firstDays.toFixed(1)}/${BETA_SOAK_DAYS} days, ${beta} quiet ${quietDays.toFixed(1)}/${BETA_QUIET_DAYS} days`,
      );
    }
  }

  // master → beta
  if (!unreleased) {
    notes.push(`master ${s.masterSha.slice(0, 7)} is already released`);
    return { kind: 'none', reason: notes.join('; ') };
  }
  notes.push(`master ${s.masterSha.slice(0, 7)} has unreleased commits`);
  return toBeta(false, notes.join('; '));
}

export function blockers(issues: JiraIssue[], since: Date, nonBugResolutions: string[]): string[] {
  const ignored = new Set(nonBugResolutions.map(normalize));
  return issues
    .filter((i) => {
      if (i.statusCategory !== 'done') return true;
      if (new Date(i.created) < since) return false;
      return !(i.resolution && ignored.has(normalize(i.resolution)));
    })
    .map((i) => i.key);
}

/** The base label plus a variant for every known beta and rc, so mislabelled bugs still count. */
export function labelsFor(base: string, s: State): string[] {
  const pres = sorted([...new Set([...s.npm.versions, ...Object.keys(s.tags)])]).filter((v) => {
    const p = mustParse(v);
    return p.base === base && p.pre !== null;
  });
  return [base, ...pres].map((v) => `ryuu.js-${v}`);
}

function ga(rc: string, s: State, reason: string): Action {
  return { kind: 'ga', version: mustParse(rc).base, from: `v${rc}`, compare: rc, hotfix: Boolean(s.tags[rc].hotfix), reason };
}

/** The newest pipeline rc of each X.Y.Z that has no GA yet and sits above latest, highest first. */
function gaCandidates(s: State): string[] {
  // Never release at or below latest, nor below any GA already published, so rolling `latest` back
  // can't make a superseded rc eligible again.
  const latest = s.npm.distTags.latest;
  const publishedGa = newest(sorted(s.npm.versions).filter((v) => mustParse(v).pre === null));
  const floor =
    [latest && parse(latest) ? latest : null, publishedGa].filter((v): v is string => v !== null).sort(cmp).pop() ?? null;
  const released = new Set(known(s).filter((v) => mustParse(v).pre === null));
  const newestRc = new Map<string, string>();
  for (const v of sorted(s.npm.versions)) {
    const p = mustParse(v);
    if (p.pre === 'rc' && isPipelineRelease(v, s)) newestRc.set(p.base, v);
  }
  return [...newestRc.entries()]
    .filter(([b]) => !released.has(b) && (!floor || cmp(b, floor) > 0))
    .map(([, v]) => v)
    .sort(cmp)
    .reverse();
}

function lastShippedMasterSha(line: string, s: State): string | null {
  const tagged = newest(stage(line, 'beta', Object.keys(s.tags)));
  if (tagged) return s.tags[tagged].parent;

  // No beta on this line yet: master was last shipped by the beta behind the newest rc.
  const rc = newest(releaseTags(s).filter((v) => mustParse(v).pre === 'rc'));
  return rc ? s.tags[parentTag(rc, s) as string].parent : null;
}

/** Beta tags, plus rc and GA tags that sit on the release chain; hand-made tags are ignored. */
function releaseTags(s: State): string[] {
  return Object.keys(s.tags).filter((v) => {
    const p = parse(v);
    return p !== null && (p.pre === 'beta' || isPipelineRelease(v, s));
  });
}

/** An rc tag sits on a beta tag of its X.Y.Z, and a GA tag sits on such an rc tag. */
function isPipelineRelease(v: string, s: State): boolean {
  const parent = parentTag(v, s);
  if (!parent) return false;
  return mustParse(v).pre === 'rc' || isPipelineRelease(parent, s);
}

/** The tag of the stage below `v` (rc → beta, GA → rc) that `v` was cut from. */
function parentTag(v: string, s: State): string | null {
  const tag = s.tags[v];
  const p = parse(v);
  if (!tag || !p || p.pre === 'beta') return null;
  const below: Pre = p.pre === 'rc' ? 'beta' : 'rc';
  return stage(p.base, below, Object.keys(s.tags)).find((t) => s.tags[t].sha === tag.parent) ?? null;
}

/** Every parseable version npm or a trusted release tag knows about, ascending. */
function known(s: State): string[] {
  return sorted([...new Set([...s.npm.versions, ...releaseTags(s)])]);
}

function stage(base: string, pre: Pre, from: string[]): string[] {
  return sorted(
    [...new Set(from)].filter((v) => {
      const p = parse(v);
      return p !== null && p.base === base && p.pre === pre;
    }),
  );
}

function sorted(versions: string[]): string[] {
  return versions.filter((v) => parse(v) !== null).sort(cmp);
}

function newest(versions: string[]): string | null {
  return versions.length ? versions[versions.length - 1] : null;
}

/** A soak has ended once `days` is within SOAK_GRACE_DAYS of it. */
function ripe(days: number, soak: number): boolean {
  return days + SOAK_GRACE_DAYS >= soak;
}

function ageDays(s: State, since: Date): number {
  return (s.now.getTime() - since.getTime()) / DAY_MS;
}

function rank(p: Parsed): number {
  return p.pre === 'beta' ? 0 : p.pre === 'rc' ? 1 : 2;
}

function nextPatch(v: string): string {
  const p = mustParse(v);
  return `${p.major}.${p.minor}.${p.patch + 1}`;
}

function mustParse(v: string): Parsed {
  const p = parse(v);
  if (!p) throw new Error(`not a pipeline version: ${v}`);
  return p;
}

function normalize(resolution: string): string {
  return resolution.trim().toLowerCase().replace(/’/g, "'");
}
