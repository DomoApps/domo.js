import { parseVersion } from "./version";

export type BumpScale = "patch" | "minor" | "major";

export function compareSemverBases(
  candidateBase: string,
  lastStableBase: string | null,
): BumpScale {
  if (lastStableBase === null) {
    return "major";
  }
  const c = parseVersion(candidateBase);
  const l = parseVersion(lastStableBase);
  if (c.major !== l.major) return "major";
  if (c.minor !== l.minor) return "minor";
  return "patch";
}
