import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { parseVersion, stripPrerelease } from "./version";

function run(cmd: string, args: string[]): void {
  execFileSync(cmd, args, { stdio: "inherit" });
}

function rewriteVersion(newVersion: string): void {
  const path = "package.json";
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  pkg.version = newVersion;
  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
}

async function main(): Promise<void> {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const v = parseVersion(pkg.version);
  if (v.prereleaseTag !== "beta") {
    throw new Error(`expected -beta version, got ${pkg.version}`);
  }
  const stable = stripPrerelease(pkg.version);

  rewriteVersion(stable);
  run("npm", ["run", "build"]);
  run("npm", ["publish"]);

  run("git", ["add", "package.json"]);
  run("git", [
    "-c",
    "user.name=ryuu-ci-bot",
    "-c",
    "user.email=ryuu-ci-bot@users.noreply.github.com",
    "commit",
    "-m",
    `chore(release): ${stable} [skip ci]`,
  ]);
  run("git", ["tag", `v${stable}`]);
  run("git", ["push", "origin", "HEAD"]);
  run("git", ["push", "origin", `v${stable}`]);

  console.log(`published ${stable} (no dist-tag changes; run promote-latest.yml to move latest)`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
