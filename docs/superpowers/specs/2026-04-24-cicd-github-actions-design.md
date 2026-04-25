# CI/CD Pipeline — GitHub Actions Subsystem (Design)

- **Date:** 2026-04-24
- **Author:** jason.hansen@domo.com (with Claude assistance)
- **Status:** Draft, pending user review
- **Repo:** [`domo.js`](https://github.com/domoinc/domo.js) (npm package `ryuu.js`)

## 1. Context

`ryuu.js` is published to npm. We want a CI/CD pipeline that automates publishing, soak-tests each candidate against a real Domo environment, and only allows stable releases that have demonstrably passed bug-free soak periods. Customers must be able to default to the latest stable version, but opt into pre-releases.

The pipeline has four subsystems:

1. **CI/CD (this spec)** — GitHub Actions workflows for publishing, version bumps, branch state, and auto-promotion.
2. **Blue / Green dashboard test apps** — Domo dashboards exercising every `ryuu.js` use case against in-flight alpha (Blue) / beta (Green) builds. Out of scope here; will be its own spec.
3. **Jira ticket structure** — labels and severity conventions used by Subsystem 2 to file bugs that Subsystem 1 reads. Convention defined here, ticket-creation lives in Subsystem 2.
4. **Manual `latest` promotion** — operator-triggered npm dist-tag move. Lives in this repo as a separate, isolated workflow; trivial enough to define here.

This spec covers Subsystems 1 and 4, and the Jira label convention used by Subsystem 1.

## 2. Goals

- Every PR merge to `master` automatically publishes `ryuu.js` to npm with `--tag alpha`.
- Once the in-flight alpha has soaked without critical/major bugs for the prescribed window, the pipeline auto-cuts a beta release branch.
- Once the beta has soaked without critical/major bugs, the pipeline auto-publishes a stable version (no npm dist-tag attached).
- The `latest` npm dist-tag is **only** moved by an explicit manual workflow run — never automatically.
- All state is derived from external systems (git, npm registry, Jira) — no persistent state store.
- Existing branch-protection rules on `master` remain enforced for human contributors.

## 3. Non-goals

- **Hotfixes for already-released stable versions.** Once `6.0.3` ships, the only path to fix a bug is to publish `6.0.4`. No `6.0.3.1` style patch releases.
- **Multiple concurrent betas.** Only one `release/v*` branch can be in `-beta` state at a time. The cron will skip cutting a new beta while one is in flight.
- **Customer-facing release notes / changelogs.** Out of scope here; can be layered on later.
- **External orchestrator service.** Logic lives entirely in GitHub Actions and stateless helper scripts.

## 4. Decisions (locked)

| Topic | Decision |
|---|---|
| Version bump trigger | Every merge to `master` bumps `-alpha.X`; version-number rolls (patch/minor/major) are explicit human edits to `package.json` via PR. |
| Master vs release branches | Master = always the alpha trunk for the next version. Release branches = beta phase per version, frozen after stable. |
| Where the version lives | Master always carries a concrete version like `6.0.3-alpha.5`. The bot updates `package.json` after each merge. |
| Soak windows (alpha / beta) | patch: 3d / 7d. minor: 7d / 14d. major: 14d / 30d. |
| Soak gate | `now - HEAD commit timestamp >= threshold` AND no open Critical/Major Jira tickets labeled with the in-flight version. |
| Promotion | Fully automatic when the gate passes. |
| Concurrent betas | Forbidden. `cut-beta` is skipped while another `release/v*` is on `-beta`. |
| Severity threshold | Critical and Major block promotion. Minor and Trivial do not. |
| Bot identity | Dedicated bot account (e.g., `ryuu-ci-bot[bot]`) with branch-protection bypass on `master` and `release/v*`. |
| Jira join key | Single label per ticket: `version:<base>-<phase>` (e.g., `version:6.0.3-alpha`). |
| `latest` dist-tag | Manual only, via `promote-latest.yml` `workflow_dispatch`. Never automatic. |
| Failure alerting | GitHub Actions default email notifications. No Slack/Teams integration in v1. |
| Helper-script language | TypeScript, run via `tsx` in workflows. Tests via Jest (already configured). |
| Cron cadence | Daily at 14:00 UTC, plus `workflow_dispatch` for manual / dry-run invocation. |

## 5. Architecture overview

```
master (alpha trunk)              auto-cut         release/vX.Y.Z (beta)         strip suffix
   PR merge → bump alpha.N  ─────────────────►   PR fix → bump beta.N  ──────────────────► publish stable
   publish --tag alpha           cut-beta.yml      publish --tag beta       publish-stable    (no tag)
                                                                                                  │
                                                                                              manual
                                                                                                  ▼
                                                                                        promote-latest.yml
                                                                                        (workflow_dispatch)
```

State sources for the soak-check cron:
- `git log` on `master` and each `release/v*` for HEAD commit timestamps.
- `npm view ryuu.js dist-tags` for the current published `latest` (used to determine bump scale).
- Jira REST API for open Critical/Major tickets matching the version label.

## 6. Workflow inventory

| Workflow | Trigger | Purpose |
|---|---|---|
| `pr-validate.yml` | `pull_request` to `master` or `release/v*` | Run `npm ci`, `npm test`, `tsc --noEmit --skipLibCheck`, `npm run build`. Required check on branch protection. |
| `publish-alpha.yml` | `push` to `master` (excluding bot commits) | (1) Read `package.json.version`. (2) Bump `-alpha.X` in-memory and rewrite `package.json`. (3) `npm ci`, `npm test`, `tsc --noEmit`, `npm run build`. (4) `npm publish --tag alpha`. (5) Bot commits the rewritten `package.json` with `[skip ci]` and pushes. The published version always equals the version committed. |
| `publish-beta.yml` | `push` to `release/v*` (excluding bot commits) | Same sequence as `publish-alpha.yml` but bumps `-beta.X` and publishes with `--tag beta`. After the push step, also creates and pushes git tag `vX.Y.Z-beta.N`. |
| `soak-check.yml` | `schedule` (daily 14:00 UTC) + `workflow_dispatch` | Evaluate the soak gate for master (alpha) and each `release/v*` (beta). Trigger downstream workflows when gates pass. Supports `dry_run` input. |
| `cut-beta.yml` | `workflow_dispatch` (called by `soak-check`, also manually triggerable) | Create `release/vX.Y.Z` from master HEAD, set version to `X.Y.Z-beta.0`, push. Also rolls master to next `X.Y.(Z+1)-alpha.0`. |
| `publish-stable.yml` | `workflow_dispatch` (called by `soak-check`) | On the given release branch, strip `-beta.X`, `npm publish` (no tag), tag `vX.Y.Z`. |
| `promote-latest.yml` | `workflow_dispatch` only | Run `npm dist-tag add ryuu.js@<version> latest`. Manual operator action. |

### 6.1 Concurrency keys

- `publish-alpha`: serializes pushes to `master`.
- `publish-beta-<branch>`: serializes pushes within a single release branch.
- `cut-beta`: prevents simultaneous cuts.
- `publish-stable-<branch>`: serializes per release branch.
- `soak-check`: prevents overlap between scheduled and manual runs.

### 6.2 Bot-loop prevention

Bot pushes use `[skip ci]` in commit messages. Workflows additionally guard with `if: github.actor != 'ryuu-ci-bot[bot]'` as a belt-and-suspenders check.

## 7. Version & branch state machine

### 7.1 Steady state

- `master`: `package.json.version` is `X.Y.Z-alpha.N`.
- `release/vX.Y.Z` (if it exists): `package.json.version` is `X.Y.Z-beta.M`.

### 7.2 Transition: alpha → beta (`cut-beta.yml`)

At the moment the soak gate passes for `master` (e.g., `master` is at `6.0.3-alpha.7`):

1. Branch off: `git checkout -b release/v6.0.3 master`. Rewrite `package.json` to `6.0.3-beta.0`. Bot commit + push. → triggers `publish-beta.yml` → publishes `6.0.3-beta.1` (the bump itself counts as merge #1).
2. Roll master forward: on `master`, rewrite `package.json` to `6.0.4-alpha.0`. Bot commit + push. → triggers `publish-alpha.yml` → publishes `6.0.4-alpha.1`.

Both pushes are by the bot. From this point on, master and the release branch evolve independently.

### 7.3 Transition: beta → stable (`publish-stable.yml`)

On `release/v6.0.3` at e.g. `6.0.3-beta.4`:

1. Rewrite `package.json` to `6.0.3` (strip the suffix). Bot commit + push.
2. `npm publish` with no `--tag` → publishes the version, does not change `latest`.
3. Create and push git tag `v6.0.3`.

The branch is then frozen. Subsequent customer adoption requires an operator to run `promote-latest.yml`.

### 7.4 Re-cutting the version (operator action)

Operator opens a PR editing `package.json` from `6.0.3-alpha.5` → `6.1.0-alpha.0`. After merge, `publish-alpha.yml` reads the new version, increments to `6.1.0-alpha.1`, and publishes. The `-alpha.N` counter resets implicitly because the operator wrote `.0`. No special workflow needed.

The soak threshold automatically extends because the bump scale is computed against the last published stable.

## 8. Soak-check algorithm

Pseudocode for `soak-check.yml`:

```ts
const candidates: Candidate[] = [];

// Master = alpha candidate
const master = readPackageJson("master");
candidates.push({
  branch: "master",
  phase: "alpha",
  version: master.version,                   // e.g. "6.0.3-alpha.7"
  base: stripSuffix(master.version),         // "6.0.3"
  lastCommitAt: gitLastCommitTime("master"),
});

// Each release/v* with -beta in package.json = beta candidate
for (const branch of listRemoteBranches("release/v*")) {
  const v = readPackageJson(branch).version;
  if (v.includes("-beta")) {
    candidates.push({
      branch,
      phase: "beta",
      version: v,
      base: v.split("-beta")[0],
      lastCommitAt: gitLastCommitTime(branch),
    });
  }
}

const lastStable = npmDistTag("ryuu.js", "latest"); // e.g. "6.0.2"

const SOAK = {
  alpha: { patch: 3,  minor: 7,  major: 14 },
  beta:  { patch: 7,  minor: 14, major: 30 },
};

for (const c of candidates) {
  const bump = compareSemver(c.base, lastStable); // "patch" | "minor" | "major"
  const thresholdDays = SOAK[c.phase][bump];
  const ageDays = daysSince(c.lastCommitAt);

  const label = `version:${c.base}-${c.phase}`;
  const openBlockers = jiraCount(
    `project = RYUU AND labels = "${label}" ` +
    `AND priority in (Critical, Major) AND status != Done`
  );

  if (ageDays >= thresholdDays && openBlockers === 0) {
    if (c.phase === "alpha") {
      if (anyOtherBranchInBeta()) {
        log(`skipping cut-beta — release branch still in beta`);
        continue;
      }
      triggerWorkflow("cut-beta.yml");
    } else {
      triggerWorkflow("publish-stable.yml", { branch: c.branch });
    }
  }
}
```

Implementation notes:
- `npm view ryuu.js dist-tags.latest` returns the current stable. If no stable has ever been published, this returns nothing; default to treating bump scale as `major` (most conservative).
- Helper functions live in `scripts/ci/*.ts` and have unit tests.
- The cron uses `peter-evans/repository-dispatch` or the GitHub REST API to trigger `cut-beta.yml` / `publish-stable.yml` (these can't be re-triggered by simply pushing).

## 9. Jira convention

Convention is enforced by Subsystem 2's ticket-creation code, but Subsystem 1 depends on it.

- **Label format:** `version:<base>-<phase>`, e.g., `version:6.0.3-alpha`, `version:6.0.3-beta`.
- **One version label per ticket.** Both parent (`[6.0.3-alpha] failures`) and child issues carry the same version label.
- **Parent vs child severity:** parent tickets are aggregators and carry the project's default priority (Medium or whatever); they do **not** block promotion. Only **child** tickets with `priority in (Critical, Major)` block promotion. The cron's JQL filters by priority, so parents with default priority are correctly ignored.
- **Status:** standard Jira workflow. The cron treats `status != Done` as "still open" — implementation may want to expand this to `not in (Done, Closed, Resolved)` depending on the project's workflow.

## 10. Error handling

| Failure mode | Behavior |
|---|---|
| `npm publish` fails (network/registry) | Workflow fails. Next merge republishes. Default GH email notification. |
| `npm publish` fails with "version exists" | Hard failure. Operator must investigate; do NOT auto-recover. |
| Jira API unreachable in soak-check | Cron fails loudly. Promotion skipped this cycle. Resumes next day. |
| Bot push to master rejected | Hard failure. Bypass is misconfigured; operator fix required. |
| Two PRs merge to master back-to-back | Concurrency group serializes. Both publish in order. |
| Cron and manual `cut-beta` both fire | Concurrency group serializes; second is a no-op. |
| Re-cut version PR mid-soak | `lastCommitAt` resets. Threshold may shift up. Both happen naturally. |
| Jira label typo on a ticket | Cron will not see it. Subsystem 2 enforces the schema. |
| First-ever publish (no `latest` dist-tag) | `npm view` returns empty. Default bump scale to `major`. |
| `publish-stable` publishes but tag push fails | Manual recovery: operator pushes the tag. Won't re-trigger; version already published. |
| Bot commit accidentally not marked `[skip ci]` | Belt-and-suspenders: workflow also checks `github.actor` and exits early. |

**Principle: fail closed on promotion.** When uncertain, do not promote.

## 11. Testing strategy

- **Helper scripts unit-tested** under `scripts/ci/__tests__/` using existing Jest config. Covers: semver comparison, soak-threshold lookup, candidate collection, Jira-query construction.
- **Workflow YAML reviewed via PR.** Logic lives in helpers; YAML is orchestration only.
- **Local execution via `act`** for smoke-testing workflow changes before pushing.
- **Fork-first testing** for risky changes: push to a fork that publishes to a private/scoped npm package and a sandbox Jira project. No risk to production npm.
- **Dry-run mode** on `publish-alpha.yml`, `publish-beta.yml`, and `soak-check.yml` via `workflow_dispatch` `dry_run: true` input. Skips destructive steps but logs what would happen.

## 12. Open setup tasks

These are prerequisites that must be completed before the workflows can run. They are part of the implementation plan but are listed here so they aren't forgotten.

- Provision the `ryuu-ci-bot[bot]` account (or GitHub App) with branch-protection bypass on `master` and `release/v*`.
- Add repo secrets: `NPM_TOKEN`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_BASE_URL`, `JIRA_PROJECT_KEY`.
- Update branch-protection rules to require `pr-validate.yml` checks.
- Confirm Jira project `RYUU` (or whatever the actual key is) has the `priority` field and standard issue workflow.
- Decide what to do with the existing `release/v*` branches. Most are historical; one (`release/v6.0.2`, the current branch) is the in-flight version — needs to be aligned with the new model on cutover.

## 13. Acceptance criteria

The pipeline is considered complete and correct when:

- A test PR merge to `master` results in an automatic alpha publish within 5 minutes, with `package.json` updated and committed by the bot.
- The soak-check workflow runs on schedule and produces a structured log showing each candidate's age, threshold, blocker count, and decision.
- Manually invoking `cut-beta.yml` produces a new `release/v*` branch with `-beta.0`, rolls master forward, and triggers a beta publish.
- Manually invoking `publish-stable.yml` strips the suffix, publishes without `--tag`, and tags the commit.
- `promote-latest.yml` correctly moves the `latest` dist-tag and is the **only** workflow that does so.
- Adding a Critical Jira ticket with the appropriate label causes the next soak-check run to skip promotion for that version.
- All helper scripts have unit-test coverage.

## 14. Sequence: this spec is Subsystem 1 only

After implementation of this spec is complete, the next pieces in order:

1. **Subsystem 2** — Blue / Green dashboard test apps (own brainstorm + spec).
2. **Subsystem 3** — Jira ticket structure setup (small spec, defines the parent/child schema and the ticket-filing module Subsystem 2 calls).
3. Long-term: revisit whether the `latest` promotion should remain manual once confidence in the soak gate is high.
