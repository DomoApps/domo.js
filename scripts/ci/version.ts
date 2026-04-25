export type PrereleaseTag = "alpha" | "beta";

export interface ParsedVersion {
  base: string;
  major: number;
  minor: number;
  patch: number;
  prereleaseTag: PrereleaseTag | null;
  prereleaseCounter: number | null;
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)\.(\d+))?$/;

export function parseVersion(version: string): ParsedVersion {
  const m = VERSION_RE.exec(version);
  if (!m) {
    throw new Error(`invalid version: ${version}`);
  }
  const [, maj, min, pat, tag, counter] = m;
  return {
    base: `${maj}.${min}.${pat}`,
    major: Number(maj),
    minor: Number(min),
    patch: Number(pat),
    prereleaseTag: (tag as PrereleaseTag) ?? null,
    prereleaseCounter: counter !== undefined ? Number(counter) : null,
  };
}

export function incrementPrereleaseCounter(version: string): string {
  const v = parseVersion(version);
  if (!v.prereleaseTag || v.prereleaseCounter === null) {
    throw new Error(`not a prerelease: ${version}`);
  }
  return `${v.base}-${v.prereleaseTag}.${v.prereleaseCounter + 1}`;
}

export function setPrerelease(version: string, tag: PrereleaseTag): string {
  const v = parseVersion(version);
  return `${v.base}-${tag}.0`;
}

export function stripPrerelease(version: string): string {
  return parseVersion(version).base;
}
