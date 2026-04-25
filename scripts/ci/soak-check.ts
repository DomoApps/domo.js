import { parseVersion } from "./version";
import { compareSemverBases } from "./semver";
import { soakThresholdDays } from "./soak-thresholds";
import { daysSince } from "./git-helpers";

export interface ReleaseBranchState {
  branch: string;
  version: string;
  commitTime: Date;
}

export interface SoakInputs {
  now: Date;
  masterVersion: string;
  masterCommitTime: Date;
  releaseBranches: ReleaseBranchState[];
  lastStableVersion: string | null;
  openBlockersForLabel: (label: string) => Promise<number>;
}

export type SoakDecision =
  | { kind: "cut-beta"; from: "master" }
  | { kind: "publish-stable"; branch: string };

export async function evaluateSoakDecisions(
  inputs: SoakInputs,
): Promise<SoakDecision[]> {
  const decisions: SoakDecision[] = [];
  const lastStableBase = inputs.lastStableVersion
    ? parseVersion(inputs.lastStableVersion).base
    : null;

  // 1. Master = alpha candidate
  const masterParsed = parseVersion(inputs.masterVersion);
  if (masterParsed.prereleaseTag === "alpha") {
    const bump = compareSemverBases(masterParsed.base, lastStableBase);
    const threshold = soakThresholdDays("alpha", bump);
    const age = daysSince(inputs.masterCommitTime, inputs.now);
    const label = `version:${masterParsed.base}-alpha`;
    const blockers = await inputs.openBlockersForLabel(label);
    const anotherBetaInFlight = inputs.releaseBranches.some((b) =>
      b.version.includes("-beta"),
    );
    if (age >= threshold && blockers === 0 && !anotherBetaInFlight) {
      decisions.push({ kind: "cut-beta", from: "master" });
    }
  }

  // 2. Each release branch with -beta = beta candidate
  for (const rb of inputs.releaseBranches) {
    const p = parseVersion(rb.version);
    if (p.prereleaseTag !== "beta") continue;
    const bump = compareSemverBases(p.base, lastStableBase);
    const threshold = soakThresholdDays("beta", bump);
    const age = daysSince(rb.commitTime, inputs.now);
    const label = `version:${p.base}-beta`;
    const blockers = await inputs.openBlockersForLabel(label);
    if (age >= threshold && blockers === 0) {
      decisions.push({ kind: "publish-stable", branch: rb.branch });
    }
  }

  return decisions;
}
