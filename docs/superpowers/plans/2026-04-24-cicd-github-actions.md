# CI/CD Pipeline (GitHub Actions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an automated CI/CD pipeline for `ryuu.js` that publishes alphas on every master merge, betas on every release-branch merge, and stables after a soak period gated on Jira-tracked Critical/Major bug counts. The `latest` npm dist-tag is moved only by an explicit operator workflow.

**Architecture:** Seven GitHub Actions workflows backed by a small set of stateless TypeScript helper modules in `scripts/ci/`. State is derived per-run from `git`, the npm registry, and the Jira REST API — there is no persistent state store. A daily cron evaluates soak gates and triggers downstream workflows when they pass.

**Tech Stack:** GitHub Actions (YAML), TypeScript executed via `tsx`, Jest with `ts-jest` for unit tests (already in repo), Node 18 (matches `.nvmrc`), Jira REST API v3 over HTTPS.

**Spec:** [`docs/superpowers/specs/2026-04-24-cicd-github-actions-design.md`](../specs/2026-04-24-cicd-github-actions-design.md)

---

## File Structure

### Created files

```
.github/workflows/
  pr-validate.yml          # PR gate: lint, test, build
  publish-alpha.yml        # On push to master: bump -alpha.X, publish --tag alpha
  publish-beta.yml         # On push to release/v*: bump -beta.X, publish --tag beta
  soak-check.yml           # Daily cron: evaluate gates, trigger promotions
  cut-beta.yml             # workflow_dispatch: branch off master, set -beta.0
  publish-stable.yml       # workflow_dispatch: strip suffix, npm publish (no tag)
  promote-latest.yml       # workflow_dispatch ONLY: move latest dist-tag

scripts/ci/
  tsconfig.json            # Node-targeted TS config for CI scripts
  version.ts               # Parse / increment version strings
  semver.ts                # Compare two semver bases → "patch" | "minor" | "major"
  soak-thresholds.ts       # Lookup table for soak windows
  npm-helpers.ts           # Shell out to `npm view` for dist-tags
  git-helpers.ts           # Shell out to git for HEAD time, branch list
  jira-client.ts           # JQL query via Jira REST API
  bump-prerelease.ts       # Read pkg version, increment counter, write back, print
  soak-check.ts            # Main orchestrator entry point
  promote-latest.ts        # Entry point invoked by promote-latest.yml
  cut-beta.ts              # Entry point invoked by cut-beta.yml
  publish-stable.ts        # Entry point invoked by publish-stable.yml

scripts/ci/__tests__/
  version.test.ts
  semver.test.ts
  soak-thresholds.test.ts
  npm-helpers.test.ts
  git-helpers.test.ts
  jira-client.test.ts
  soak-check.test.ts

docs/ci/
  setup.md                 # Operator runbook: secrets, bot account, branch protection
```

### Modified files

```
package.json               # Add `tsx`, `nock` to devDependencies; add `ci:*` scripts
jest.config.js             # Add second Jest project for `scripts/ci/` with node env
README.md                  # Add a "Release process" section linking to docs/ci/setup.md
```

### Deleted files

```
.github/workflows/publish-dev.yml.disabled    # Superseded by publish-alpha.yml
```

---

## Phase 0 — Manual prerequisites (operator action, not code)

These have to be in place **before** workflows are turned on, but they don't block writing or unit-testing the code in Phases 1–6. The plan calls them out explicitly so they aren't forgotten at cutover.

### Task 0.1: Provision the bot identity

**Files:** none (account-level setup in GitHub UI / org admin)

- [ ] **Step 1: Create the bot account or GitHub App**

In the org admin UI, create either:
- A machine user named `ryuu-ci-bot` (option A), or
- A GitHub App named `ryuu-ci-bot` installed on the `domo.js` repo (option B — preferred long-term).

Recommended: GitHub App. Generate a private key and note the App ID + installation ID for later step.

- [ ] **Step 2: Generate credentials**

For a machine user: create a personal access token (classic) with scopes `repo`, `workflow`, `write:packages`. Save it.

For a GitHub App: download the private key `.pem` file. Save it.

- [ ] **Step 3: Confirm npm publish access**

The bot must be able to publish `ryuu.js`. In npm: `npm token create --read-only=false` from the bot's npm account, OR add the bot as a maintainer of the `ryuu.js` package.

### Task 0.2: Add repo secrets

**Files:** none (Settings → Secrets and variables → Actions in GitHub UI)

- [ ] **Step 1: Add the following repo secrets**

| Secret name | Value | Used by |
|---|---|---|
| `NPM_TOKEN` | npm token from Task 0.1 step 3 | `publish-alpha`, `publish-beta`, `publish-stable`, `promote-latest` |
| `BOT_GITHUB_TOKEN` | bot PAT (machine user) OR omit if using GitHub App below | All workflows that push or trigger other workflows |
| `BOT_APP_ID` | GitHub App ID (if using App) | All workflows |
| `BOT_APP_PRIVATE_KEY` | GitHub App private key contents (if using App) | All workflows |
| `JIRA_BASE_URL` | e.g. `https://domo.atlassian.net` | `soak-check` |
| `JIRA_EMAIL` | service account email | `soak-check` |
| `JIRA_API_TOKEN` | Jira API token | `soak-check` |
| `JIRA_PROJECT_KEY` | e.g. `RYUU` | `soak-check` |

### Task 0.3: Configure branch protection (deferred)

**Files:** none (Settings → Branches in GitHub UI)

This task is **deferred until after Task 2.1 lands** — the protection rule references `pr-validate.yml` which doesn't exist yet.

- [ ] **Step 1: Update `master` protection rule**

Configure:
- Require pull request before merging
- Require status checks: `pr-validate.yml`
- Allow force pushes: never
- Allow specified actors to bypass required pull requests: add the bot

- [ ] **Step 2: Update `release/v*` protection rule**

Same as master, but applied to the `release/v*` pattern.

---

## Phase 1 — Helper scripts in TypeScript (TDD)

Each script is a focused module with unit tests. The workflows in later phases shell out to these scripts via `tsx`.

### Task 1.1: Bootstrap `scripts/ci/` directory and dev tooling

**Files:**
- Create: `scripts/ci/tsconfig.json`
- Modify: `package.json`
- Modify: `jest.config.js`

- [ ] **Step 1: Add tsx and nock to devDependencies**

Run:

```bash
npm install --save-dev tsx@^4.7.0 nock@^13.5.0
```

Expected: `package.json` and `package-lock.json` updated, `node_modules/` populated.

- [ ] **Step 2: Add CI scripts to package.json**

Edit `package.json`. In the `scripts` block, add (alongside existing scripts):

```json
"ci:bump-prerelease": "tsx scripts/ci/bump-prerelease.ts",
"ci:soak-check": "tsx scripts/ci/soak-check.ts",
"ci:cut-beta": "tsx scripts/ci/cut-beta.ts",
"ci:publish-stable": "tsx scripts/ci/publish-stable.ts",
"ci:promote-latest": "tsx scripts/ci/promote-latest.ts"
```

- [ ] **Step 3: Create `scripts/ci/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "lib": ["es2020"],
    "module": "commonjs",
    "target": "es2020",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node", "jest"]
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 4: Update Jest config to support node-environment tests for CI scripts**

Replace `jest.config.js` with:

```js
const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  projects: [
    {
      displayName: "sdk",
      testEnvironment: "jsdom",
      transform: { ...tsJestTransformCfg },
      testMatch: ["<rootDir>/src/**/*.test.ts"],
    },
    {
      displayName: "ci",
      testEnvironment: "node",
      transform: { ...tsJestTransformCfg },
      testMatch: ["<rootDir>/scripts/ci/__tests__/**/*.test.ts"],
    },
  ],
};
```

- [ ] **Step 5: Add @types/node**

```bash
npm install --save-dev @types/node@^18
```

- [ ] **Step 6: Confirm everything still passes**

Run: `npm test`
Expected: existing 235 SDK tests pass, "ci" project shows "No tests found" (no tests yet — that's fine).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json jest.config.js scripts/ci/tsconfig.json
git commit -m "chore(ci): bootstrap scripts/ci tooling and Jest project"
```

### Task 1.2: `version.ts` — parse and increment version strings

**Files:**
- Create: `scripts/ci/version.ts`
- Test: `scripts/ci/__tests__/version.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/ci/__tests__/version.test.ts`:

```ts
import {
  parseVersion,
  incrementPrereleaseCounter,
  setPrerelease,
  stripPrerelease,
} from "../version";

describe("parseVersion", () => {
  it("parses a stable version", () => {
    expect(parseVersion("6.0.3")).toEqual({
      base: "6.0.3",
      major: 6,
      minor: 0,
      patch: 3,
      prereleaseTag: null,
      prereleaseCounter: null,
    });
  });

  it("parses an alpha prerelease", () => {
    expect(parseVersion("6.0.3-alpha.7")).toEqual({
      base: "6.0.3",
      major: 6,
      minor: 0,
      patch: 3,
      prereleaseTag: "alpha",
      prereleaseCounter: 7,
    });
  });

  it("parses a beta prerelease", () => {
    expect(parseVersion("6.0.3-beta.0")).toEqual({
      base: "6.0.3",
      major: 6,
      minor: 0,
      patch: 3,
      prereleaseTag: "beta",
      prereleaseCounter: 0,
    });
  });

  it("throws on malformed version", () => {
    expect(() => parseVersion("not-a-version")).toThrow(/invalid version/i);
  });
});

describe("incrementPrereleaseCounter", () => {
  it("bumps the alpha counter", () => {
    expect(incrementPrereleaseCounter("6.0.3-alpha.5")).toBe("6.0.3-alpha.6");
  });

  it("bumps the beta counter", () => {
    expect(incrementPrereleaseCounter("6.0.3-beta.0")).toBe("6.0.3-beta.1");
  });

  it("throws if the version is not a prerelease", () => {
    expect(() => incrementPrereleaseCounter("6.0.3")).toThrow(
      /not a prerelease/i,
    );
  });
});

describe("setPrerelease", () => {
  it("converts stable to alpha.0", () => {
    expect(setPrerelease("6.0.3", "alpha")).toBe("6.0.3-alpha.0");
  });

  it("converts alpha to beta.0", () => {
    expect(setPrerelease("6.0.3-alpha.7", "beta")).toBe("6.0.3-beta.0");
  });
});

describe("stripPrerelease", () => {
  it("strips alpha suffix", () => {
    expect(stripPrerelease("6.0.3-alpha.7")).toBe("6.0.3");
  });

  it("strips beta suffix", () => {
    expect(stripPrerelease("6.0.3-beta.4")).toBe("6.0.3");
  });

  it("returns base unchanged when no suffix", () => {
    expect(stripPrerelease("6.0.3")).toBe("6.0.3");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects ci`
Expected: FAIL — `Cannot find module '../version'`.

- [ ] **Step 3: Implement `scripts/ci/version.ts`**

```ts
export type PrereleaseTag = "alpha" | "beta";

export interface ParsedVersion {
  base: string;
  major: number;
  minor: number;
  patch: number;
  prereleaseTag: PrereleaseTag | null;
  prereleaseCounter: number | null;
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)\.(\d+))?$/;

export function parseVersion(version: string): ParsedVersion {
  const m = VERSION_RE.exec(version);
  if (!m) {
    throw new Error(`invalid version: ${version}`);
  }
  const [, maj, min, pat, tag, counter] = m;
  return {
    base: `${maj}.${min}.${pat}`,
    major: Number(maj),
    minor: Number(min),
    patch: Number(pat),
    prereleaseTag: (tag as PrereleaseTag) ?? null,
    prereleaseCounter: counter !== undefined ? Number(counter) : null,
  };
}

export function incrementPrereleaseCounter(version: string): string {
  const v = parseVersion(version);
  if (!v.prereleaseTag || v.prereleaseCounter === null) {
    throw new Error(`not a prerelease: ${version}`);
  }
  return `${v.base}-${v.prereleaseTag}.${v.prereleaseCounter + 1}`;
}

export function setPrerelease(version: string, tag: PrereleaseTag): string {
  const v = parseVersion(version);
  return `${v.base}-${tag}.0`;
}

export function stripPrerelease(version: string): string {
  return parseVersion(version).base;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects ci version.test`
Expected: 11 tests passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/ci/version.ts scripts/ci/__tests__/version.test.ts
git commit -m "feat(ci): add version parsing/incrementing helpers"
```

### Task 1.3: `semver.ts` — compute bump scale between two version bases

**Files:**
- Create: `scripts/ci/semver.ts`
- Test: `scripts/ci/__tests__/semver.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/ci/__tests__/semver.test.ts`:

```ts
import { compareSemverBases } from "../semver";

describe("compareSemverBases", () => {
  it("returns patch when only patch differs", () => {
    expect(compareSemverBases("6.0.3", "6.0.2")).toBe("patch");
  });

  it("returns minor when minor differs (patch ignored)", () => {
    expect(compareSemverBases("6.1.0", "6.0.2")).toBe("minor");
  });

  it("returns major when major differs", () => {
    expect(compareSemverBases("7.0.0", "6.0.2")).toBe("major");
  });

  it("returns major when there is no last stable", () => {
    expect(compareSemverBases("6.0.3", null)).toBe("major");
  });

  it("treats equal versions as patch", () => {
    expect(compareSemverBases("6.0.3", "6.0.3")).toBe("patch");
  });

  it("throws if either argument is malformed", () => {
    expect(() => compareSemverBases("not-a-version", "6.0.2")).toThrow(/invalid version/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects ci semver.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scripts/ci/semver.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects ci semver.test`
Expected: 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/ci/semver.ts scripts/ci/__tests__/semver.test.ts
git commit -m "feat(ci): add bump-scale comparator"
```

### Task 1.4: `soak-thresholds.ts` — soak window lookup

**Files:**
- Create: `scripts/ci/soak-thresholds.ts`
- Test: `scripts/ci/__tests__/soak-thresholds.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/ci/__tests__/soak-thresholds.test.ts`:

```ts
import { soakThresholdDays } from "../soak-thresholds";

describe("soakThresholdDays", () => {
  it("alpha + patch = 3", () => {
    expect(soakThresholdDays("alpha", "patch")).toBe(3);
  });

  it("alpha + minor = 7", () => {
    expect(soakThresholdDays("alpha", "minor")).toBe(7);
  });

  it("alpha + major = 14", () => {
    expect(soakThresholdDays("alpha", "major")).toBe(14);
  });

  it("beta + patch = 7", () => {
    expect(soakThresholdDays("beta", "patch")).toBe(7);
  });

  it("beta + minor = 14", () => {
    expect(soakThresholdDays("beta", "minor")).toBe(14);
  });

  it("beta + major = 30", () => {
    expect(soakThresholdDays("beta", "major")).toBe(30);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects ci soak-thresholds.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scripts/ci/soak-thresholds.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects ci soak-thresholds.test`
Expected: 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/ci/soak-thresholds.ts scripts/ci/__tests__/soak-thresholds.test.ts
git commit -m "feat(ci): add soak-threshold lookup table"
```

### Task 1.5: `npm-helpers.ts` — query npm registry for dist-tags

**Files:**
- Create: `scripts/ci/npm-helpers.ts`
- Test: `scripts/ci/__tests__/npm-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/ci/__tests__/npm-helpers.test.ts`:

```ts
import { getLatestStableVersion } from "../npm-helpers";

const mockExec = jest.fn();
jest.mock("node:child_process", () => ({
  execFileSync: (...args: any[]) => mockExec(...args),
}));

describe("getLatestStableVersion", () => {
  beforeEach(() => mockExec.mockReset());

  it("returns the latest dist-tag value", () => {
    mockExec.mockReturnValueOnce(Buffer.from("6.0.2\n"));
    expect(getLatestStableVersion("ryuu.js")).toBe("6.0.2");
    expect(mockExec).toHaveBeenCalledWith("npm", [
      "view",
      "ryuu.js",
      "dist-tags.latest",
    ]);
  });

  it("returns null when there is no latest tag", () => {
    mockExec.mockReturnValueOnce(Buffer.from(""));
    expect(getLatestStableVersion("ryuu.js")).toBeNull();
  });

  it("returns null when npm view exits with E404 in stderr", () => {
    const err: any = new Error("npm error");
    err.stderr = Buffer.from("npm ERR! code E404");
    mockExec.mockImplementationOnce(() => {
      throw err;
    });
    expect(getLatestStableVersion("ryuu.js")).toBeNull();
  });

  it("rethrows other errors", () => {
    const err: any = new Error("network");
    err.stderr = Buffer.from("");
    mockExec.mockImplementationOnce(() => {
      throw err;
    });
    expect(() => getLatestStableVersion("ryuu.js")).toThrow(/network/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects ci npm-helpers.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scripts/ci/npm-helpers.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects ci npm-helpers.test`
Expected: 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/ci/npm-helpers.ts scripts/ci/__tests__/npm-helpers.test.ts
git commit -m "feat(ci): add npm registry helper"
```

### Task 1.6: `git-helpers.ts` — git state queries

**Files:**
- Create: `scripts/ci/git-helpers.ts`
- Test: `scripts/ci/__tests__/git-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/ci/__tests__/git-helpers.test.ts`:

```ts
import {
  getHeadCommitTime,
  listRemoteReleaseBranches,
  daysSince,
} from "../git-helpers";

const mockExec = jest.fn();
jest.mock("node:child_process", () => ({
  execFileSync: (...args: any[]) => mockExec(...args),
}));

describe("getHeadCommitTime", () => {
  beforeEach(() => mockExec.mockReset());

  it("returns the commit time as a Date", () => {
    mockExec.mockReturnValueOnce(Buffer.from("2026-04-20T12:00:00+00:00\n"));
    const result = getHeadCommitTime("master");
    expect(result.toISOString()).toBe("2026-04-20T12:00:00.000Z");
    expect(mockExec).toHaveBeenCalledWith("git", [
      "log",
      "-1",
      "--format=%cI",
      "master",
    ]);
  });
});

describe("listRemoteReleaseBranches", () => {
  beforeEach(() => mockExec.mockReset());

  it("returns short names of release/v* remote branches", () => {
    mockExec.mockReturnValueOnce(
      Buffer.from(
        "origin/release/v6.0.1\norigin/release/v6.0.2\norigin/release/v6.0.3\n",
      ),
    );
    expect(listRemoteReleaseBranches()).toEqual([
      "release/v6.0.1",
      "release/v6.0.2",
      "release/v6.0.3",
    ]);
  });

  it("returns empty list when none match", () => {
    mockExec.mockReturnValueOnce(Buffer.from(""));
    expect(listRemoteReleaseBranches()).toEqual([]);
  });
});

describe("daysSince", () => {
  it("returns the number of whole days since the given timestamp", () => {
    const fixedNow = new Date("2026-04-24T14:00:00Z");
    const past = new Date("2026-04-20T14:00:00Z");
    expect(daysSince(past, fixedNow)).toBe(4);
  });

  it("returns fractional days truncated toward zero", () => {
    const fixedNow = new Date("2026-04-24T18:00:00Z");
    const past = new Date("2026-04-24T06:00:00Z");
    expect(daysSince(past, fixedNow)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects ci git-helpers.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scripts/ci/git-helpers.ts`**

```ts
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
```

Note: the test mocks `execFileSync` to call the spy directly, so the `git for-each-ref` invocation in `listRemoteReleaseBranches` must match the test mock — adjust the test if you change argv. (Specifically, the second test's mock returns three `origin/release/v*` lines, which matches `git for-each-ref refs/remotes/origin/release/` output format.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects ci git-helpers.test`
Expected: 5 tests passed.

If `listRemoteReleaseBranches` test fails because the mock argv differs, fix the test argv to match the implementation:

```ts
expect(mockExec).toHaveBeenCalledWith("git", [
  "for-each-ref",
  "--format=%(refname:short)",
  "refs/remotes/origin/release/",
]);
```

- [ ] **Step 5: Commit**

```bash
git add scripts/ci/git-helpers.ts scripts/ci/__tests__/git-helpers.test.ts
git commit -m "feat(ci): add git state helpers"
```

### Task 1.7: `jira-client.ts` — read-only JQL queries

**Files:**
- Create: `scripts/ci/jira-client.ts`
- Test: `scripts/ci/__tests__/jira-client.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/ci/__tests__/jira-client.test.ts`:

```ts
import nock from "nock";
import { countOpenBlockers } from "../jira-client";

const config = {
  baseUrl: "https://example.atlassian.net",
  email: "ci@example.com",
  apiToken: "tok-123",
  projectKey: "RYUU",
};

afterEach(() => nock.cleanAll());

describe("countOpenBlockers", () => {
  it("returns the total count from the search response", async () => {
    nock(config.baseUrl)
      .post("/rest/api/3/search", (body) => {
        expect(body.jql).toBe(
          'project = "RYUU" AND labels = "version:6.0.3-alpha" ' +
            'AND priority in (Critical, Major) AND status != Done',
        );
        expect(body.fields).toEqual([]);
        expect(body.maxResults).toBe(0);
        return true;
      })
      .matchHeader("authorization", /^Basic /)
      .matchHeader("accept", "application/json")
      .reply(200, { total: 2, issues: [] });

    const count = await countOpenBlockers(config, "version:6.0.3-alpha");
    expect(count).toBe(2);
  });

  it("returns 0 when total is 0", async () => {
    nock(config.baseUrl)
      .post("/rest/api/3/search")
      .reply(200, { total: 0, issues: [] });
    expect(await countOpenBlockers(config, "version:6.0.3-alpha")).toBe(0);
  });

  it("throws on non-2xx response", async () => {
    nock(config.baseUrl).post("/rest/api/3/search").reply(401, { error: "auth" });
    await expect(
      countOpenBlockers(config, "version:6.0.3-alpha"),
    ).rejects.toThrow(/Jira returned 401/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects ci jira-client.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scripts/ci/jira-client.ts`**

```ts
export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
}

export async function countOpenBlockers(
  cfg: JiraConfig,
  versionLabel: string,
): Promise<number> {
  const jql =
    `project = "${cfg.projectKey}" AND labels = "${versionLabel}" ` +
    `AND priority in (Critical, Major) AND status != Done`;

  const auth = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64");
  const res = await fetch(`${cfg.baseUrl}/rest/api/3/search`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ jql, fields: [], maxResults: 0 }),
  });

  if (!res.ok) {
    throw new Error(`Jira returned ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as { total: number };
  return body.total;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects ci jira-client.test`
Expected: 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/ci/jira-client.ts scripts/ci/__tests__/jira-client.test.ts
git commit -m "feat(ci): add Jira JQL client"
```

### Task 1.8: `soak-check.ts` — main orchestrator

**Files:**
- Create: `scripts/ci/soak-check.ts`
- Test: `scripts/ci/__tests__/soak-check.test.ts`

This task wires the previous helpers into the cron's algorithm. Network and shell calls are passed in as injected dependencies so the unit test can run without git or Jira.

- [ ] **Step 1: Write the failing test**

Create `scripts/ci/__tests__/soak-check.test.ts`:

```ts
import { evaluateSoakDecisions, type SoakInputs } from "../soak-check";

const fixedNow = new Date("2026-04-24T14:00:00Z");
const tenDaysAgo = new Date("2026-04-14T14:00:00Z");
const oneDayAgo = new Date("2026-04-23T14:00:00Z");

function mkInputs(overrides: Partial<SoakInputs> = {}): SoakInputs {
  return {
    now: fixedNow,
    masterVersion: "6.0.3-alpha.7",
    masterCommitTime: tenDaysAgo,
    releaseBranches: [],
    lastStableVersion: "6.0.2",
    openBlockersForLabel: async () => 0,
    ...overrides,
  };
}

describe("evaluateSoakDecisions", () => {
  it("triggers cut-beta when alpha gate passes and no other beta in flight", async () => {
    const decisions = await evaluateSoakDecisions(mkInputs());
    expect(decisions).toEqual([{ kind: "cut-beta", from: "master" }]);
  });

  it("does not trigger when alpha is too young", async () => {
    const decisions = await evaluateSoakDecisions(
      mkInputs({ masterCommitTime: oneDayAgo }),
    );
    expect(decisions).toEqual([]);
  });

  it("does not trigger when an open Critical/Major bug exists", async () => {
    const decisions = await evaluateSoakDecisions(
      mkInputs({ openBlockersForLabel: async () => 1 }),
    );
    expect(decisions).toEqual([]);
  });

  it("triggers publish-stable for a soaked beta branch", async () => {
    const decisions = await evaluateSoakDecisions(
      mkInputs({
        releaseBranches: [
          {
            branch: "release/v6.0.3",
            version: "6.0.3-beta.4",
            commitTime: tenDaysAgo,
          },
        ],
      }),
    );
    expect(decisions).toContainEqual({
      kind: "publish-stable",
      branch: "release/v6.0.3",
    });
  });

  it("blocks cut-beta when another release branch is still in beta", async () => {
    const decisions = await evaluateSoakDecisions(
      mkInputs({
        releaseBranches: [
          {
            branch: "release/v6.0.2",
            version: "6.0.2-beta.1",
            commitTime: oneDayAgo,
          },
        ],
      }),
    );
    expect(decisions).not.toContainEqual({ kind: "cut-beta", from: "master" });
  });

  it("uses major-bump threshold when no last stable exists", async () => {
    const decisions = await evaluateSoakDecisions(
      mkInputs({ lastStableVersion: null, masterCommitTime: tenDaysAgo }),
    );
    expect(decisions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects ci soak-check.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scripts/ci/soak-check.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects ci soak-check.test`
Expected: 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/ci/soak-check.ts scripts/ci/__tests__/soak-check.test.ts
git commit -m "feat(ci): add soak-check decision logic"
```

### Task 1.9: `soak-check.ts` — runtime entry point

**Files:**
- Modify: `scripts/ci/soak-check.ts` (append `main()` and CLI invocation)

This adds the side-effecting wiring (read git, npm, Jira, write decisions to stdout / GitHub Actions outputs) on top of the pure logic from Task 1.8.

- [ ] **Step 1: Append the runtime entry point to `scripts/ci/soak-check.ts`**

Add after the existing exports:

```ts
import { execFileSync } from "node:child_process";
import { readFileSync, appendFileSync } from "node:fs";
import {
  getHeadCommitTime,
  listRemoteReleaseBranches,
} from "./git-helpers";
import { getLatestStableVersion } from "./npm-helpers";
import { countOpenBlockers, type JiraConfig } from "./jira-client";

function readPackageJsonVersion(ref: string): string {
  const raw = execFileSync("git", ["show", `${ref}:package.json`]).toString();
  return JSON.parse(raw).version as string;
}

function readJiraConfig(): JiraConfig {
  const required = [
    "JIRA_BASE_URL",
    "JIRA_EMAIL",
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
    email: process.env.JIRA_EMAIL!,
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
```

- [ ] **Step 2: Confirm existing tests still pass**

Run: `npx jest --selectProjects ci soak-check.test`
Expected: 6 tests pass (entry point isn't exercised by unit tests).

- [ ] **Step 3: Smoke test the entry point with stubbed env**

(Optional, but recommended.) Run with `DRY_RUN=true` and dummy env vars on a checked-out repo with at least `origin/master` accessible:

```bash
JIRA_BASE_URL=https://example.atlassian.net \
JIRA_EMAIL=a@b.c \
JIRA_API_TOKEN=fake \
JIRA_PROJECT_KEY=RYUU \
DRY_RUN=true \
npx tsx scripts/ci/soak-check.ts
```

Expected: prints "=== Soak check decisions ===" and a (possibly empty) decisions array. Will fail at the Jira call if any candidate exists; that's expected for a smoke test (consider stubbing or pointing at a real sandbox).

- [ ] **Step 4: Commit**

```bash
git add scripts/ci/soak-check.ts
git commit -m "feat(ci): add soak-check runtime entry point"
```

### Task 1.10: `cut-beta.ts`, `publish-stable.ts`, `promote-latest.ts` — small entry points

**Files:**
- Create: `scripts/ci/cut-beta.ts`
- Create: `scripts/ci/publish-stable.ts`
- Create: `scripts/ci/promote-latest.ts`

These are thin scripts that workflows invoke to do specific actions. They are straightforward enough that we test them via integration in the workflow phase rather than unit tests; logic is mostly delegating to git/npm CLIs.

- [ ] **Step 1: Create `scripts/ci/cut-beta.ts`**

```ts
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
```

- [ ] **Step 2: Create `scripts/ci/publish-stable.ts`**

```ts
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
```

- [ ] **Step 3: Create `scripts/ci/promote-latest.ts`**

```ts
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
```

- [ ] **Step 4: Type-check the scripts directory**

Run: `npx tsc --noEmit -p scripts/ci/tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/ci/cut-beta.ts scripts/ci/publish-stable.ts scripts/ci/promote-latest.ts
git commit -m "feat(ci): add entry points for cut-beta, publish-stable, promote-latest"
```

### Task 1.11: `bump-prerelease.ts` — script used by publish-alpha and publish-beta

**Files:**
- Create: `scripts/ci/bump-prerelease.ts`

This script reads `package.json`, increments the `-alpha.X` or `-beta.X` counter, writes it back, and prints the new version on stdout. It also writes the new version to `$GITHUB_OUTPUT` (under key `next`) when running in a GitHub Actions context, so subsequent steps can read it.

We avoid inlining this logic into workflow YAML because shell-quoting TypeScript across `npx tsx -e "..."` is fragile.

- [ ] **Step 1: Create `scripts/ci/bump-prerelease.ts`**

```ts
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
```

- [ ] **Step 2: Smoke-test the script locally**

Create a temp working tree with a fake `package.json` and run:

```bash
echo '{"version":"6.0.3-alpha.5"}' > /tmp/pkg-test/package.json
cd /tmp/pkg-test && cp -r ~/Documents/GitHub/domo.js/scripts/ci ./scripts-ci-copy
# (just a smoke test; the real test is via the workflow.)
```

Or simpler: run from the repo root in a worktree, manually mutate `package.json` to a known alpha version, run `npx tsx scripts/ci/bump-prerelease.ts`, confirm stdout prints the bumped value and `package.json` is updated. **Then revert the change with `git restore package.json`.**

- [ ] **Step 3: Commit**

```bash
git add scripts/ci/bump-prerelease.ts
git commit -m "feat(ci): add bump-prerelease script for publish workflows"
```

---

## Phase 2 — Workflows: PR validation and continuous publishing

### Task 2.1: `pr-validate.yml`

**Files:**
- Create: `.github/workflows/pr-validate.yml`

- [ ] **Step 1: Create `.github/workflows/pr-validate.yml`**

```yaml
name: PR Validate

on:
  pull_request:
    branches:
      - master
      - "release/v*"

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          registry-url: "https://registry.npmjs.org/"
      - run: npm ci
      - run: npx tsc --noEmit --skipLibCheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Validate the YAML locally with actionlint**

If `actionlint` is installed: `actionlint .github/workflows/pr-validate.yml`. Expected: no errors. (If not installed, skip — GitHub will validate on push.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pr-validate.yml
git commit -m "ci: add pr-validate workflow"
```

- [ ] **Step 4: Operator follow-up**

Push to a feature branch and open a PR to verify the workflow runs. Once green, perform Task 0.3: enable the required-status-check rule on `master` and `release/v*`.

### Task 2.2: `publish-alpha.yml`

**Files:**
- Create: `.github/workflows/publish-alpha.yml`

- [ ] **Step 1: Create `.github/workflows/publish-alpha.yml`**

```yaml
name: Publish Alpha

on:
  push:
    branches:
      - master
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Skip npm publish and bot push"
        required: false
        default: "false"

concurrency:
  group: publish-alpha
  cancel-in-progress: false

jobs:
  publish:
    if: github.actor != 'ryuu-ci-bot[bot]' && !contains(github.event.head_commit.message, '[skip ci]')
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.BOT_GITHUB_TOKEN }}
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          registry-url: "https://registry.npmjs.org/"
      - run: npm ci

      - name: Bump alpha counter
        id: bump
        run: npm run ci:bump-prerelease

      - run: npx tsc --noEmit --skipLibCheck
      - run: npm test
      - run: npm run build

      - name: Publish to npm with --tag alpha
        if: ${{ inputs.dry_run != 'true' }}
        run: npm publish --tag alpha
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Bot commit version bump
        if: ${{ inputs.dry_run != 'true' }}
        run: |
          set -euo pipefail
          git config user.name "ryuu-ci-bot"
          git config user.email "ryuu-ci-bot@users.noreply.github.com"
          git add package.json
          git commit -m "chore(release): ${{ steps.bump.outputs.next }} [skip ci]"
          git push origin HEAD:master
```

- [ ] **Step 2: Validate YAML**

Run: `actionlint .github/workflows/publish-alpha.yml` (if installed)
Expected: no errors. Acceptable to skip if `actionlint` isn't available.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish-alpha.yml
git commit -m "ci: add publish-alpha workflow"
```

### Task 2.3: `publish-beta.yml`

**Files:**
- Create: `.github/workflows/publish-beta.yml`

- [ ] **Step 1: Create `.github/workflows/publish-beta.yml`**

```yaml
name: Publish Beta

on:
  push:
    branches:
      - "release/v*"
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Skip npm publish and bot push"
        required: false
        default: "false"

concurrency:
  group: publish-beta-${{ github.ref }}
  cancel-in-progress: false

jobs:
  publish:
    if: github.actor != 'ryuu-ci-bot[bot]' && !contains(github.event.head_commit.message, '[skip ci]')
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.BOT_GITHUB_TOKEN }}
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          registry-url: "https://registry.npmjs.org/"
      - run: npm ci

      - name: Bump beta counter
        id: bump
        run: npm run ci:bump-prerelease

      - run: npx tsc --noEmit --skipLibCheck
      - run: npm test
      - run: npm run build

      - name: Publish to npm with --tag beta
        if: ${{ inputs.dry_run != 'true' }}
        run: npm publish --tag beta
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Bot commit + tag
        if: ${{ inputs.dry_run != 'true' }}
        run: |
          set -euo pipefail
          git config user.name "ryuu-ci-bot"
          git config user.email "ryuu-ci-bot@users.noreply.github.com"
          git add package.json
          git commit -m "chore(release): ${{ steps.bump.outputs.next }} [skip ci]"
          git tag "v${{ steps.bump.outputs.next }}"
          git push origin HEAD:${{ github.ref_name }}
          git push origin "v${{ steps.bump.outputs.next }}"
```

- [ ] **Step 2: Validate YAML**

Run: `actionlint .github/workflows/publish-beta.yml` (if installed)
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish-beta.yml
git commit -m "ci: add publish-beta workflow"
```

---

## Phase 3 — Promotion workflows

### Task 3.1: `cut-beta.yml`

**Files:**
- Create: `.github/workflows/cut-beta.yml`

- [ ] **Step 1: Create `.github/workflows/cut-beta.yml`**

```yaml
name: Cut Beta

on:
  workflow_dispatch:

concurrency:
  group: cut-beta
  cancel-in-progress: false

jobs:
  cut:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: master
          token: ${{ secrets.BOT_GITHUB_TOKEN }}
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
      - run: npm ci
      - run: npm run ci:cut-beta
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/cut-beta.yml
git commit -m "ci: add cut-beta workflow"
```

### Task 3.2: `publish-stable.yml`

**Files:**
- Create: `.github/workflows/publish-stable.yml`

- [ ] **Step 1: Create `.github/workflows/publish-stable.yml`**

```yaml
name: Publish Stable

on:
  workflow_dispatch:
    inputs:
      branch:
        description: "Release branch to promote (e.g. release/v6.0.3)"
        required: true

concurrency:
  group: publish-stable-${{ inputs.branch }}
  cancel-in-progress: false

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ inputs.branch }}
          token: ${{ secrets.BOT_GITHUB_TOKEN }}
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          registry-url: "https://registry.npmjs.org/"
      - run: npm ci
      - name: Strip suffix, build, publish, tag, push
        run: npm run ci:publish-stable
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/publish-stable.yml
git commit -m "ci: add publish-stable workflow"
```

---

## Phase 4 — Cron

### Task 4.1: `soak-check.yml`

**Files:**
- Create: `.github/workflows/soak-check.yml`

- [ ] **Step 1: Create `.github/workflows/soak-check.yml`**

```yaml
name: Soak Check

on:
  schedule:
    - cron: "0 14 * * *"   # daily 14:00 UTC
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Skip triggering downstream workflows"
        required: false
        default: "false"

concurrency:
  group: soak-check
  cancel-in-progress: false

jobs:
  evaluate:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      actions: write   # to trigger other workflows via gh CLI
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
      - run: npm ci

      - name: Evaluate soak gates
        id: eval
        run: npm run ci:soak-check
        env:
          DRY_RUN: ${{ inputs.dry_run || 'false' }}
          JIRA_BASE_URL: ${{ secrets.JIRA_BASE_URL }}
          JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
          JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
          JIRA_PROJECT_KEY: ${{ secrets.JIRA_PROJECT_KEY }}

      - name: Trigger downstream workflows
        if: ${{ inputs.dry_run != 'true' }}
        env:
          GH_TOKEN: ${{ secrets.BOT_GITHUB_TOKEN }}
          DECISIONS: ${{ steps.eval.outputs.decisions }}
        run: |
          set -euo pipefail
          echo "$DECISIONS" | jq -c '.[]' | while read -r decision; do
            kind=$(echo "$decision" | jq -r '.kind')
            case "$kind" in
              cut-beta)
                echo "Triggering cut-beta.yml"
                gh workflow run cut-beta.yml
                ;;
              publish-stable)
                branch=$(echo "$decision" | jq -r '.branch')
                echo "Triggering publish-stable.yml for $branch"
                gh workflow run publish-stable.yml -f branch="$branch"
                ;;
            esac
          done
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/soak-check.yml
git commit -m "ci: add soak-check cron"
```

---

## Phase 5 — Manual operator workflow

### Task 5.1: `promote-latest.yml`

**Files:**
- Create: `.github/workflows/promote-latest.yml`

- [ ] **Step 1: Create `.github/workflows/promote-latest.yml`**

```yaml
name: Promote Latest

on:
  workflow_dispatch:
    inputs:
      version:
        description: "Stable version to mark as latest (e.g. 6.0.3)"
        required: true

jobs:
  promote:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          registry-url: "https://registry.npmjs.org/"
      - run: npm ci
      - name: Move latest dist-tag
        run: npm run ci:promote-latest
        env:
          VERSION: ${{ inputs.version }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/promote-latest.yml
git commit -m "ci: add manual promote-latest workflow"
```

---

## Phase 6 — Cutover and cleanup

### Task 6.1: Operator runbook

**Files:**
- Create: `docs/ci/setup.md`

- [ ] **Step 1: Create `docs/ci/setup.md`**

```markdown
# CI/CD Pipeline — Operator Runbook

## One-time setup

1. **Bot identity** — provision `ryuu-ci-bot` (machine user or GitHub App). See `docs/superpowers/specs/2026-04-24-cicd-github-actions-design.md` §12.
2. **npm access** — bot must be a maintainer of `ryuu.js` (or have a write-scoped token).
3. **Repo secrets** — set `NPM_TOKEN`, `BOT_GITHUB_TOKEN`, `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`.
4. **Branch protection** — `master` and `release/v*` require `pr-validate` checks. Bot is in the bypass list.

## Day-to-day operations

| What | How |
|---|---|
| Land a change | Open a PR to `master`. After merge, alpha publishes automatically. |
| Roll the version (e.g. 6.0.3 → 6.1.0) | Open a PR editing `package.json` from `6.0.3-alpha.X` to `6.1.0-alpha.0`. After merge, alpha publishes at `6.1.0-alpha.1`. |
| Force a soak-check now | Run `Soak Check` workflow manually with `dry_run: false`. |
| Inspect what soak-check would do | Run `Soak Check` with `dry_run: true`. |
| Force-cut a beta | Run `Cut Beta` workflow manually. |
| Force-publish stable | Run `Publish Stable` with the release branch name. |
| Move customers to new stable | Run `Promote Latest` with the stable version (e.g. `6.0.3`). |

## Recovery

- **`npm publish` failed with "version exists"** — package.json is out of sync with npm. Manually fast-forward `package.json.version` to one above the highest published, then re-trigger the workflow.
- **Bot push rejected** — branch protection bypass is misconfigured. Add the bot to the bypass list.
- **Stable was published but tag push failed** — manually `git tag vX.Y.Z` and `git push origin vX.Y.Z`.

## Conventions

- Jira tickets that should block promotion must have label `version:<base>-<phase>` (e.g. `version:6.0.3-alpha`) and priority Critical or Major.
- Parent aggregator tickets remain at default priority and are not seen by the soak gate.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ci/setup.md
git commit -m "docs(ci): add operator runbook"
```

### Task 6.2: README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Release process" section to the README**

Append to the existing README:

```markdown

## Release process

`ryuu.js` uses an automated CI/CD pipeline. PRs merge to `master`, which auto-publishes a new alpha. After a soak period without Critical/Major Jira bugs, the pipeline cuts a beta release branch, soaks again, and publishes a stable version. Customers default to whatever the `latest` npm dist-tag points to; the maintainer moves `latest` manually when a stable is ready for general consumption.

See [`docs/ci/setup.md`](./docs/ci/setup.md) for the operator runbook and [`docs/superpowers/specs/2026-04-24-cicd-github-actions-design.md`](./docs/superpowers/specs/2026-04-24-cicd-github-actions-design.md) for the full design.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: link release process from README"
```

### Task 6.3: Remove the obsolete disabled workflow

**Files:**
- Delete: `.github/workflows/publish-dev.yml.disabled`

- [ ] **Step 1: Confirm the file is no longer referenced**

Run: `grep -r "publish-dev" .` (excluding node_modules)
Expected: only matches inside `publish-dev.yml.disabled` itself.

- [ ] **Step 2: Delete the file**

```bash
git rm .github/workflows/publish-dev.yml.disabled
```

- [ ] **Step 3: Commit**

```bash
git commit -m "ci: remove obsolete publish-dev placeholder"
```

### Task 6.4: First-run validation checklist (operator action)

This task is a manual checklist after all code lands. No code changes.

- [ ] **Step 1: Verify `pr-validate.yml` runs on a no-op PR**

Open and close a PR that touches a comment in `README.md`. Confirm `pr-validate` runs and passes.

- [ ] **Step 2: Verify alpha publish on a real merge**

Merge a tiny PR (typo fix). Confirm:
- `publish-alpha.yml` runs to completion.
- npm shows a new alpha version (`npm view ryuu.js dist-tags.alpha`).
- `package.json` on master has been updated by the bot.

- [ ] **Step 3: Verify soak-check with `dry_run`**

Run `Soak Check` with `dry_run: true`. Confirm the log prints the candidate and a non-error decision (likely `[]` if soak time hasn't elapsed).

- [ ] **Step 4: Verify `cut-beta.yml` against a sandbox npm scope (optional but recommended)**

In a fork: run `Cut Beta` and confirm the new release branch is created and a beta is published to a private/scoped package. Do not run against production npm until soak times have actually elapsed in production.

- [ ] **Step 5: Configure branch protection (Task 0.3)**

After observing `pr-validate` is green for at least one PR, enable required-status-check on `master` and `release/v*`. Add the bot to the bypass list.

---

## Self-review

A skim of the spec against this plan:

- §6 workflow inventory → Tasks 2.1, 2.2, 2.3, 3.1, 3.2, 4.1, 5.1. ✓
- §7 state machine → cut-beta and publish-stable entry points (Task 1.10) implement the state transitions. ✓
- §8 soak-check algorithm → `evaluateSoakDecisions` (Task 1.8) + runtime entry (Task 1.9). ✓
- §9 Jira convention → `jira-client.ts` (Task 1.7) constructs the JQL exactly as specified. Documented in `docs/ci/setup.md` (Task 6.1). ✓
- §10 error handling → `[skip ci]` + actor guard in workflows (Tasks 2.2, 2.3); `getLatestStableVersion` returns null on E404 (Task 1.5); soak-check fails closed when Jira errors (Task 1.7 throws → workflow fails → no promotion). ✓
- §11 testing strategy → unit tests on every helper, dry-run mode on alpha/beta/soak workflows. ✓
- §12 open setup tasks → Phase 0 + `docs/ci/setup.md`. ✓
- §13 acceptance criteria → Task 6.4 checklist. ✓
- Subsystem 4 manual `latest` → Task 5.1. ✓

No placeholders found in tasks. Type names are consistent (`PrereleaseTag`, `BumpScale`, `SoakDecision` used identically across files).
