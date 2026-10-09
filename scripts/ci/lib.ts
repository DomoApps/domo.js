// Pure release-decision logic for the ryuu.js pipeline. No I/O: release.ts gathers
// state from npm, git and Jira and hands it in. See RELEASING.md for the model.
//
// Stages: X.Y.Z-beta.N (npm `beta`) → X.Y.Z-rc.N (npm `rc`) → X.Y.Z (npm `latest`).

export const BETA_SOAK_DAYS = 14;
export const RC_SOAK_DAYS = 30;
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

export type Action =
  | { kind: 'none'; reason: string }
  | { kind: 'publish'; version: string; reason: string }
  | { kind: 'beta'; version: string; from: string; compare: string | null; reason: string }
  | { kind: 'rc'; version: string; from: string; compare: string; reason: string }
  | { kind: 'ga'; version: string; from: string; compare: string; reason: string };

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

/** The X.Y.Z that new merges ship as betas: the line after the newest rc or GA, or master's floor. */
export function activeBase(s: State): string {
  const finished = known(s).filter((v) => mustParse(v).pre !== 'beta');
  const next = finished.length ? nextPatch(finished[finished.length - 1]) : null;
  const floor = baseOf(s.masterVersion);
  const candidates = [next, floor].filter((v): v is string => v !== null).sort(cmp);
  if (!candidates.length) throw new Error(`no released versions and no usable master version (${s.masterVersion})`);
  return candidates[candidates.length - 1];
}

/** One past every `pre` number npm or git has ever seen for `base`; npm never reuses a version. */
export function nextNumber(base: string, pre: Pre, s: State): number {
  const seen = [...s.npm.versions, ...Object.keys(s.npm.time), ...Object.keys(s.tags)]
    .map(parse)
    .filter((p): p is Parsed => p !== null && p.base === base && p.pre === pre)
    .map((p) => p.num as number);
  return seen.length ? Math.max(...seen) + 1 : 0;
}

/** A pipeline tag that was pushed but never reached npm (e.g. the publish run failed). */
export function pendingPublish(s: State): string | null {
  const onNpm = sorted(s.npm.versions);
  const npmMax = onNpm[onNpm.length - 1];
  const pending = sorted(releaseTags(s)).filter(
    (v) => !(v in s.npm.time) && !s.npm.versions.includes(v) && (!npmMax || cmp(v, npmMax) > 0),
  );
  return pending[0] ?? null;
}

/**
 * At most one irreversible step per run, in priority order: finish a pending publish,
 * release a soaked rc as latest, promote a soaked beta to rc, cut a beta from master.
 */
export async function planRelease(s: State, bugs: BugCheck, o: PlanOptions = {}): Promise<Action> {
  const pending = pendingPublish(s);
  if (pending) return { kind: 'publish', version: pending, reason: `v${pending} is tagged but not on npm` };

  const notes: string[] = [];

  // rc → latest
  const rcs = gaCandidates(s);
  if (o.forceGa) {
    return rcs.length
      ? ga(rcs[0], `force_ga: releasing ${rcs[0]}`)
      : { kind: 'none', reason: 'force_ga: no rc to release' };
  }
  for (const rc of rcs) {
    const since = new Date(s.npm.time[rc]);
    const days = ageDays(s, since);
    if (days < RC_SOAK_DAYS) {
      notes.push(`${rc} has soaked ${days.toFixed(1)}/${RC_SOAK_DAYS} days`);
      continue;
    }
    const found = await bugs(labelsFor(mustParse(rc).base, s), since);
    if (!found.length) return ga(rc, `${rc} soaked ${days.toFixed(1)} days with no bugs`);
    notes.push(`${rc} blocked by ${found.join(', ')}`);
  }

  // beta → rc
  const line = activeBase(s);
  const beta = newest(stage(line, 'beta', s.npm.versions).filter((v) => s.tags[v]));
  const rc = (reason: string): Action => ({
    kind: 'rc',
    version: `${line}-rc.${nextNumber(line, 'rc', s)}`,
    from: `v${beta}`,
    compare: beta as string,
    reason,
  });
  if (o.forceRc) return beta ? rc(`force_rc: promoting ${beta}`) : { kind: 'none', reason: 'force_rc: no beta to promote' };
  if (beta) {
    const since = new Date(s.npm.time[beta]);
    const days = ageDays(s, since);
    if (days >= BETA_SOAK_DAYS) {
      const found = await bugs(labelsFor(line, s), since);
      if (!found.length) return rc(`${beta} soaked ${days.toFixed(1)} days with no bugs`);
      notes.push(`rc of ${line} blocked by ${found.join(', ')}`);
    } else {
      notes.push(`${beta} has soaked ${days.toFixed(1)}/${BETA_SOAK_DAYS} days`);
    }
  }

  // master → beta
  if (lastShippedMasterSha(line, s) === s.masterSha) {
    notes.push(`master ${s.masterSha.slice(0, 7)} is already released`);
    return { kind: 'none', reason: notes.join('; ') };
  }
  const shipped = sorted(s.npm.versions).filter((v) => mustParse(v).pre !== 'beta');
  notes.push(`master ${s.masterSha.slice(0, 7)} has unreleased commits`);
  return {
    kind: 'beta',
    version: `${line}-beta.${nextNumber(line, 'beta', s)}`,
    from: s.masterSha,
    compare: beta ?? newest(shipped),
    reason: notes.join('; '),
  };
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

function ga(rc: string, reason: string): Action {
  return { kind: 'ga', version: mustParse(rc).base, from: `v${rc}`, compare: rc, reason };
}

/** The newest pipeline rc of each X.Y.Z that has no GA yet and sits above latest, highest first. */
function gaCandidates(s: State): string[] {
  const latest = s.npm.distTags.latest;
  const floor = latest && parse(latest) ? latest : null;
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
