import { execFileSync } from "node:child_process";

export function getLatestStableVersion(packageName: string): string | null {
  try {
    const out = execFileSync("npm", ["view", packageName, "dist-tags.latest"]);
    const trimmed = out.toString().trim();
    return trimmed.length === 0 ? null : trimmed;
  } catch (err) {
    const stderr =
      (err as { stderr?: Buffer | string }).stderr?.toString() ?? "";
    if (stderr.includes("E404")) return null;
    throw err;
  }
}
