import { execFileSync } from "node:child_process";

export function getHeadCommitTime(ref: string): Date {
  const out = execFileSync("git", ["log", "-1", "--format=%cI", ref])
    .toString()
    .trim();
  return new Date(out);
}

export function listRemoteReleaseBranches(): string[] {
  const out = execFileSync("git", [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/remotes/origin/release/",
  ]).toString();
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/^origin\//, ""));
}

export function daysSince(when: Date, now: Date = new Date()): number {
  const ms = now.getTime() - when.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
