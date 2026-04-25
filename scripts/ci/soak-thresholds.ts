import type { PrereleaseTag } from "./version";
import type { BumpScale } from "./semver";

const TABLE: Record<PrereleaseTag, Record<BumpScale, number>> = {
  alpha: { patch: 3, minor: 7, major: 14 },
  beta: { patch: 7, minor: 14, major: 30 },
};

export function soakThresholdDays(
  phase: PrereleaseTag,
  bump: BumpScale,
): number {
  return TABLE[phase][bump];
}
