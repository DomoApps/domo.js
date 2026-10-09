// Pure release-decision logic for the ryuu.js pipeline. No I/O: release.ts gathers
// state from npm, git and Jira and hands it in. See RELEASING.md for the model.

export const BETA_SOAK_DAYS = 14;
export const STABLE_SOAK_DAYS = 30;
export const NON_BUG_RESOLUTIONS = ['duplicate', "won't do", "won't fix", 'cannot reproduce', 'not a bug'];

const DAY_MS = 86_400_000;
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/;

export interface Parsed {
  base: string;
  major: number;
  minor: number;
  patch: number;
  beta: number | null;
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
  /** Pipeline tags, keyed by version without the leading `v`. */
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
  | { kind: 'ga'; version: string; from: string; compare: string; reason: string }
  | { kind: 'beta'; version: string; from: string; compare: string | null; reason: string }
  | { kind: 'stable'; version: string; reason: string };

/** Parses `X.Y.Z` or `X.Y.Z-beta.N`; anything else (alphas, legacy formats) is null. */
export function parse(v: string): Parsed | null {
  const m = VERSION_RE.exec(v);
  if (!m) return null;
  return {
    base: `${m[1]}.${m[2]}.${m[3]}`,
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    beta: m[4] === undefined ? null : Number(m[4]),
  };
}

/** Lenient `X.Y.Z` prefix, used for master's package.json version floor. */
export function baseOf(v: string): string | null {
  const m = /^(\d+\.\d+\.\d+)/.exec(v);
  return m ? m[1] : null;
}

export function cmp(a: string, b: string): number {
  const pa = mustParse(a);
  const pb = mustParse(b);
  return (
    pa.major - pb.major ||
    pa.minor - pb.minor ||
    pa.patch - pb.patch ||
    (pa.beta ?? Infinity) - (pb.beta ?? Infinity) ||
    0
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

export function activeBase(s: State): string {
  const ga = gaVersions(s);
  const next = ga.length ? nextPatch(ga[ga.length - 1]) : null;
  const floor = baseOf(s.masterVersion);
  const candidates = [next, floor].filter((v): v is string => v !== null).sort(cmp);
  if (!candidates.length) throw new Error(`no GA versions and no usable master version (${s.masterVersion})`);
  return candidates[candidates.length - 1];
}

/** One past every beta number npm or git has ever seen for `base`; npm never reuses a version. */
export function nextBetaNumber(base: string, s: State): number {
  const seen = [...s.npm.versions, ...Object.keys(s.npm.time), ...Object.keys(s.tags)]
    .map(parse)
    .filter((p): p is Parsed => p !== null && p.base === base && p.beta !== null)
    .map((p) => p.beta as number);
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

export async function planRelease(s: State, bugs: BugCheck, o: { forceGa?: boolean } = {}): Promise<Action> {
  const pending = pendingPublish(s);
  if (pending) return { kind: 'publish', version: pending, reason: `v${pending} is tagged but not on npm` };

  const line = activeBase(s);
  const notes: string[] = [];

  const soaked = newest(betasOf(line, s.npm.versions));
  if (soaked && s.tags[soaked]) {
    const since = new Date(s.npm.time[soaked]);
    const ageDays = (s.now.getTime() - since.getTime()) / DAY_MS;
    const promote = { kind: 'ga', version: line, from: `v${soaked}`, compare: soaked } as const;
    if (o.forceGa) return { ...promote, reason: `force_ga: promoting ${soaked}` };
    if (ageDays >= BETA_SOAK_DAYS) {
      const found = await bugs(labelsFor(line, s), since);
      if (!found.length) return { ...promote, reason: `${soaked} soaked ${ageDays.toFixed(1)} days with no bugs` };
      notes.push(`GA ${line} blocked by ${found.join(', ')}`);
    } else {
      notes.push(`${soaked} has soaked ${ageDays.toFixed(1)}/${BETA_SOAK_DAYS} days`);
    }
  }

  const shipped = lastShippedMasterSha(line, s);
  if (shipped === s.masterSha) {
    notes.push(`master ${s.masterSha.slice(0, 7)} is already released`);
    return { kind: 'none', reason: notes.join('; ') };
  }

  const ga = gaVersions(s, s.npm.versions);
  const version = `${line}-beta.${nextBetaNumber(line, s)}`;
  notes.push(`master ${s.masterSha.slice(0, 7)} has unreleased commits`);
  return {
    kind: 'beta',
    version,
    from: s.masterSha,
    compare: soaked ?? ga[ga.length - 1] ?? null,
    reason: notes.join('; '),
  };
}

export async function planStable(s: State, bugs: BugCheck): Promise<Action> {
  const latest = s.npm.distTags.latest;
  const stable = s.npm.distTags.stable;
  const candidates = gaVersions(s, s.npm.versions)
    .filter((v) => isPipelineGa(v, s) && latest && cmp(v, latest) <= 0 && (!stable || cmp(v, stable) > 0))
    .reverse();

  const notes: string[] = [];
  for (const v of candidates) {
    const since = new Date(s.npm.time[v]);
    const ageDays = (s.now.getTime() - since.getTime()) / DAY_MS;
    if (ageDays < STABLE_SOAK_DAYS) {
      notes.push(`${v} has been GA ${ageDays.toFixed(1)}/${STABLE_SOAK_DAYS} days`);
      continue;
    }
    const found = await bugs(labelsFor(mustParse(v).base, s), since);
    if (!found.length) {
      return { kind: 'stable', version: v, reason: `${v} GA for ${ageDays.toFixed(1)} days with no bugs` };
    }
    notes.push(`${v} blocked by ${found.join(', ')}`);
  }
  return { kind: 'none', reason: notes.join('; ') || `no tagged GA newer than stable (${stable ?? 'unset'})` };
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

/** The base label plus a `-beta.N` variant for every known beta, so mislabelled bugs still count. */
export function labelsFor(base: string, s: State): string[] {
  return [base, ...betasOf(base, [...s.npm.versions, ...Object.keys(s.tags)])].map((v) => `ryuu.js-${v}`);
}

function lastShippedMasterSha(line: string, s: State): string | null {
  const tagged = newest(betasOf(line, Object.keys(s.tags)));
  if (tagged) return s.tags[tagged].parent;

  // No beta on this line yet: master was last shipped by the beta behind the newest GA.
  const ga = newest(gaVersions(s).filter((v) => isPipelineGa(v, s)));
  return ga ? s.tags[soakedBetaOf(ga, s) as string].parent : null;
}

/** Beta tags plus pipeline GA tags; a hand-made GA tag must not move the line or stall publishing. */
function releaseTags(s: State): string[] {
  return Object.keys(s.tags).filter((v) => {
    const p = parse(v);
    return p !== null && (p.beta !== null || isPipelineGa(v, s));
  });
}

/** Pipeline GA tags sit directly on a beta tag of the same line; legacy tags (v5.0.1, v2.x) don't. */
function isPipelineGa(v: string, s: State): boolean {
  return soakedBetaOf(v, s) !== null;
}

function soakedBetaOf(ga: string, s: State): string | null {
  const tag = s.tags[ga];
  if (!tag) return null;
  return betasOf(ga, Object.keys(s.tags)).find((b) => s.tags[b].sha === tag.parent) ?? null;
}

function gaVersions(s: State, from: string[] = [...s.npm.versions, ...releaseTags(s)]): string[] {
  return sorted([...new Set(from)].filter((v) => parse(v)?.beta === null));
}

function betasOf(base: string, from: string[]): string[] {
  return sorted(
    [...new Set(from)].filter((v) => {
      const p = parse(v);
      return p !== null && p.base === base && p.beta !== null;
    }),
  );
}

function sorted(versions: string[]): string[] {
  return versions.filter((v) => parse(v) !== null).sort(cmp);
}

function newest(versions: string[]): string | null {
  return versions.length ? versions[versions.length - 1] : null;
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
