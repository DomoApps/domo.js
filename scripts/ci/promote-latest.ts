import { execFileSync } from "node:child_process";

async function main(): Promise<void> {
  const version = process.env.VERSION;
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`VERSION must be a stable semver (e.g. 6.0.3); got ${version ?? "<unset>"}`);
  }
  execFileSync("npm", ["dist-tag", "add", `ryuu.js@${version}`, "latest"], {
    stdio: "inherit",
  });
  console.log(`moved latest -> ryuu.js@${version}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
