import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { incrementPrereleaseCounter } from "./version";

function main(): void {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const next = incrementPrereleaseCounter(pkg.version);
  pkg.version = next;
  writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

  // Stdout for direct shell capture.
  console.log(next);

  // GitHub Actions step output for downstream steps.
  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    appendFileSync(out, `next=${next}\n`);
  }
}

if (require.main === module) {
  main();
}
