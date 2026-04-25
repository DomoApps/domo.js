import { execFileSync } from "node:child_process";
import { readFileSync, appendFileSync } from "node:fs";
import { parseVersion } from "./version";
import { compareSemverBases } from "./semver";
import { soakThresholdDays } from "./soak-thresholds";
import { daysSince, getHeadCommitTime, listRemoteReleaseBranches } from "./git-helpers";
import { getLatestStableVersion } from "./npm-helpers";
import { countOpenBlockers, type JiraConfig } from "./jira-client";

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

function readPackageJsonVersion(ref: string): string {
  const raw = execFileSync("git", ["show", `${ref}:package.json`]).toString();
  return JSON.parse(raw).version as string;
}

function readJiraConfig(): JiraConfig {
  const required = [
    "JIRA_BASE_URL",
    "JIRA_API_TOKEN",
    "JIRA_PROJECT_KEY",
  ] as const;
  for (const k of required) {
    if (!process.env[k]) {
      throw new Error(`missing required env var: ${k}`);
    }
  }
  return {
    baseUrl: process.env.JIRA_BASE_URL!,
    apiToken: process.env.JIRA_API_TOKEN!,
    projectKey: process.env.JIRA_PROJECT_KEY!,
  };
}

async function main(): Promise<void> {
  const dryRun = process.env.DRY_RUN === "true";
  const jira = readJiraConfig();

  const masterVersion = readPackageJsonVersion("origin/master");
  const masterCommitTime = getHeadCommitTime("origin/master");

  const releaseBranches = listRemoteReleaseBranches().map((branch) => ({
    branch,
    version: readPackageJsonVersion(`origin/${branch}`),
    commitTime: getHeadCommitTime(`origin/${branch}`),
  }));

  const lastStableVersion = getLatestStableVersion("ryuu.js");

  const decisions = await evaluateSoakDecisions({
    now: new Date(),
    masterVersion,
    masterCommitTime,
    releaseBranches,
    lastStableVersion,
    openBlockersForLabel: (label) => countOpenBlockers(jira, label),
  });

  console.log("=== Soak check decisions ===");
  console.log(JSON.stringify(decisions, null, 2));
  console.log(`dry_run=${dryRun}`);

  // Emit decisions as a GitHub Actions output for downstream steps to consume.
  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    appendFileSync(out, `decisions=${JSON.stringify(decisions)}\n`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
