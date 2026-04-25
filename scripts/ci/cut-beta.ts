import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { parseVersion, setPrerelease } from "./version";

function git(...args: string[]): void {
  execFileSync("git", args, { stdio: "inherit" });
}

function bumpPatchBase(base: string): string {
  const v = parseVersion(base);
  return `${v.major}.${v.minor}.${v.patch + 1}`;
}

function rewriteVersion(newVersion: string): void {
  const path = "package.json";
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  pkg.version = newVersion;
  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
}

async function main(): Promise<void> {
  // Read current master version (workflow checked out master).
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const v = parseVersion(pkg.version);
  if (v.prereleaseTag !== "alpha") {
    throw new Error(`expected master to be on -alpha, got ${pkg.version}`);
  }

  const releaseBranch = `release/v${v.base}`;
  const betaVersion = setPrerelease(v.base, "beta");

  // 1. Branch off master, set -beta.0, push.
  git("checkout", "-b", releaseBranch);
  rewriteVersion(betaVersion);
  git("add", "package.json");
  git(
    "-c",
    "user.name=ryuu-ci-bot",
    "-c",
    "user.email=ryuu-ci-bot@users.noreply.github.com",
    "commit",
    "-m",
    `chore(release): cut ${betaVersion} [skip ci]`,
  );
  git("push", "origin", releaseBranch);

  // 2. Roll master forward to next patch alpha.
  git("checkout", "master");
  const nextBase = bumpPatchBase(v.base);
  const nextAlphaZero = setPrerelease(nextBase, "alpha");
  rewriteVersion(nextAlphaZero);
  git("add", "package.json");
  git(
    "-c",
    "user.name=ryuu-ci-bot",
    "-c",
    "user.email=ryuu-ci-bot@users.noreply.github.com",
    "commit",
    "-m",
    `chore(release): roll master to ${nextAlphaZero} [skip ci]`,
  );
  git("push", "origin", "master");

  console.log(`cut ${releaseBranch} at ${betaVersion}; master now ${nextAlphaZero}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
