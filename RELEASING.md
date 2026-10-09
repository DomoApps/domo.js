# Releasing ryuu.js

Releases are automatic. You merge PRs into `master`; GitHub Actions decides when each change is ready for customers. Nobody runs `npm publish` by hand. A typical change reaches customers about two weeks after it merges; a PR labeled `release:hotfix` reaches them in about 15 minutes.

- [The release cycle](#the-release-cycle)
- [The rules](#the-rules)
- [Hotfixes](#hotfixes)
- [Example rollout](#example-rollout)
- [Interrupts: what happens if…](#interrupts-what-happens-if)
- [Testing it yourself](#testing-it-yourself)
- [Settings](#settings)
- [One-time setup](#one-time-setup)
- [Recovery](#recovery)

## The release cycle

```mermaid
flowchart TD
    PR["PR into master"] -->|"PR Validate passes"| MERGE["Merge"]
    MERGE --> CHANGED{"Did the npm package change?"}
    CHANGED -->|"no (demo, tests, CI, devDependencies)"| NOTHING["Nothing published"]
    CHANGED -->|"yes"| HOT{"PR labeled<br/>release:hotfix?"}
    HOT -->|"yes"| FAST["beta, rc and latest<br/>back to back, about 15 minutes"]
    HOT -->|"no"| BETA["X.Y.Z-beta.N on npm tag beta"]
    BETA --> SOAK1{"First beta 7+ days old,<br/>newest beta 3+ days old,<br/>no blocking bugs?"}
    SOAK1 -->|"bug: fix it and merge"| BETA
    SOAK1 -->|"yes"| RC["X.Y.Z-rc.0 on npm tag rc<br/>new merges start X.Y.Z+1"]
    RC --> SOAK2{"7 days with<br/>no blocking bugs?"}
    SOAK2 -->|"bug: the fix ships in X.Y.Z+1"| SKIP["This rc is skipped"]
    SOAK2 -->|"yes"| GA["X.Y.Z on npm tag latest<br/>customers get it<br/>branch release/vX.Y.Z"]
```

| npm tag | Example | Who gets it |
|---|---|---|
| `latest` | `6.0.10` | **Customers.** `npm install ryuu.js`, CDN URLs without a version, and npm installs of ranges like `^6.0.9` |
| `rc` | `6.0.10-rc.0` | Anyone who asks for `ryuu.js@rc` |
| `beta` | `6.0.10-beta.3` | Anyone who asks for `ryuu.js@beta` |

Betas and rcs are prereleases. No package manager installs one from a normal range like `^6.0.9`, so customers only ever move to a version that passed both soaks, or that was shipped as a hotfix.

## The rules

1. **Every PR** runs PR Validate (type check, tests, build, package contents). It must pass to merge.
2. **After a merge**, Release builds `master` and compares the npm package with the last one published. A changed package becomes the next beta. A merge that only touches the demo, tests, CI or devDependencies publishes nothing.
3. **A version moves from beta to rc** once its **first** beta is 7 days old, its **newest** beta is 3 days old, and it has no blocking bugs. A new beta restarts only the 3-day quiet clock, so steady merging can't hold a release back forever. Once the rc is cut, the next merge that changes the package starts the next patch version.
4. **An rc that reaches 7 days with no blocking bugs** is published as `latest`, with a `vX.Y.Z` tag and a `release/vX.Y.Z` branch. Each step ships the exact build that soaked; only the version number changes.
5. **A PR labeled `release:hotfix`** skips both soaks and the Jira check. See [Hotfixes](#hotfixes).
6. **A bug blocks a version** when it's a Jira **Bug** labeled `ryuu.js-X.Y.Z` (no `-beta`/`-rc` suffix), and it's either still unresolved, or was reported during the current soak and wasn't closed as Duplicate, Won't Do, Won't Fix, Cannot Reproduce or Not a Bug. All priorities count.
7. **Release runs** after every merge, daily at 15:23 UTC, and after every publish, but only while `RELEASE_ENABLED` is `true`. It also runs whenever you click Run workflow, whatever that setting is. Each run does at most one thing, in this order: retry a failed publish, release a soaked rc, promote a soaked beta, cut a beta.

## Hotfixes

To get a fix to customers right away, add the **`release:hotfix`** label to its PR **before merging**. The PR still needs review and passing checks to merge. After the merge, Release publishes the beta, the rc and `latest` back to back, about 15 minutes in all. Each step still builds, tests, verifies the tag and checks that the package is identical to the step before.

- **It ships everything on `master` that isn't released yet**, not just the fix, because every release is cut from `master`.
- **Any rc still soaking is superseded.** It ends up below `latest` and never ships on its own; its changes are in the hotfix.
- **Adding the label after the merge does nothing.** For a fix that's already merged, use Run workflow with `force_rc` once its beta is published, then with `force_ga` once the rc is published.
- **The automatic chain needs `RELEASE_ENABLED=true`.** While releases are paused, start each step yourself with Run workflow (`dry_run` off). The hotfix marker is on the tag, so each step still skips its soak.
- **If the PR doesn't change the npm package**, there's nothing to release.

## Example rollout

Day 0 is Nov 2. This assumes automatic releases are on.

```mermaid
gantt
    title Example rollout (day 0 = Nov 2)
    dateFormat YYYY-MM-DD
    axisFormat %b %d
    section 6.0.10
    beta.0 (first beta)          :b0, 2026-11-02, 5d
    beta.1 (bug filed day 6)     :crit, b1, 2026-11-07, 3d
    beta.2 quiet 3 days          :b2, 2026-11-10, 3d
    rc.0 soaks 7 days            :r0, 2026-11-13, 7d
    6.0.10 on latest             :milestone, g0, 2026-11-20, 0d
    section 6.0.11
    beta.0 soaks 7 days          :b11, 2026-11-15, 7d
    rc.0 (bug filed day 22)      :crit, r11, 2026-11-22, 3d
    section 6.0.12 hotfix
    beta, rc and latest          :milestone, g12, 2026-11-25, 0d
```

| Day | What happens | What Release does |
|---|---|---|
| 0 (Nov 2) | Merge a `src/` change | Publishes `6.0.10-beta.0` on `beta`. The 7-day first-beta clock starts |
| 2 | Merge a demo-only change | Package unchanged: publishes nothing |
| 5 | Merge a bug fix | Publishes `6.0.10-beta.1`. The 3-day quiet clock restarts; the 7-day clock doesn't |
| 6 | **Interrupt:** QA files a Bug labeled `ryuu.js-6.0.10` | Nothing yet, but the bug blocks the rc while it's open |
| 7 | Daily run: the first beta is 7 days old | Waits: beta.1 is only 2 days old, and the bug is open |
| 8 | The fix merges; the bug is resolved as Fixed | Publishes `6.0.10-beta.2`. The bug was reported before beta.2, so it no longer blocks |
| 11 (Nov 13) | Daily run: beta.2 has been quiet 3 days with no blocking bugs | Publishes `6.0.10-rc.0` on `rc`. New merges now go to 6.0.11 |
| 13 | Merge a feature | Publishes `6.0.11-beta.0`. 6.0.10's rc soak isn't affected |
| 18 (Nov 20) | Daily run: `6.0.10-rc.0` is 7 days old with no bugs | **Publishes `6.0.10` on `latest`.** Customers move from 6.0.9 to 6.0.10. Creates `release/v6.0.10` |
| 20 | Daily run | Promotes `6.0.11-beta.0` to `6.0.11-rc.0` |
| 22 | **Interrupt:** a Bug is filed against `ryuu.js-6.0.11` | 6.0.11 can no longer reach `latest` (unless the bug is closed as Not a Bug, Duplicate, etc.) |
| 23 (Nov 25) | **Interrupt:** the fix merges with the `release:hotfix` label | Publishes `6.0.12-beta.0`, then `6.0.12-rc.0`, then **`6.0.12` on `latest`**, about 15 minutes after the merge. 6.0.11 is skipped; its changes ship in 6.0.12 |

## Interrupts: what happens if…

| Interrupt | Effect |
|---|---|
| **A fix is urgent but already merged without the label** | Click Run workflow with `force_rc` once its beta is published, then with `force_ga` once the rc is published. The result is the same as the label |
| **Releases are paused** (`RELEASE_ENABLED=false`) from day 9 to 15 | Merges and daily runs do nothing. Soak clocks keep counting, because they measure time since publish. The first run after resuming (day 15) cuts `6.0.10-rc.0`, 4 days later than in the example. Merges that waited ship as a beta right after |
| **Jira is down**, or the token expired, when a promotion is due | That run fails and does nothing: no promotion, and no beta either. Every run with a promotion due keeps failing until it's fixed. After that, the next run carries on. Hotfixes don't consult Jira |
| **The npm publish fails** (npm outage, trusted publisher misconfigured) | The git tag exists but the version isn't on npm. Every run retries that publish before anything else. Clocks start from the real npm publish time, so no soak is shortened |
| **A bug filed against an rc is closed as Not a Bug** (or Duplicate, Won't Do…) | The block lifts. The rc continues on its original 7-day clock |
| **A bug filed during a beta soak stays open** | The rc waits. Betas keep publishing as merges land; each restarts only the 3-day quiet clock |
| **We want 6.1.0** | Open a PR that sets `master`'s `package.json` `version` to `6.1.0-beta.0`. The next merge that changes the package publishes `6.1.0-beta.0`. A 6.0.x line still in beta is abandoned; rcs already cut still continue to `latest` |
| **A merge only touches the demo, tests, CI or devDependencies** | Nothing is published, and no clock changes |

## Testing it yourself

From a local checkout. None of these push to GitHub or publish to npm.

```bash
# Unit tests for the release logic
npx jest --selectProjects ci

# What would Release do right now? (reads npm and origin/master)
git fetch origin
npm run release:plan

# ...as if it were 15 days from now
SIMULATE_NOW=+15d npm run release:plan

# ...as if your current branch were already merged
MASTER_REF=HEAD npm run release:plan

# Full rehearsal in a throwaway clone: merge → beta → tag → publish check,
# ending with `npm publish --dry-run`
npm run release:rehearse
```

When a promotion is due, `release:plan` asks Jira, so export `JIRA_BASE_URL`, `JIRA_PROJECTS`, `JIRA_EMAIL` and `JIRA_API_TOKEN` first.

On GitHub. A dry run builds and tests but pushes and publishes nothing:

```bash
gh workflow run release.yml --repo DomoApps/domo.js -f dry_run=true
gh workflow run release.yml --repo DomoApps/domo.js -f dry_run=true -f simulate_now=+15d

gh run list --workflow release.yml --repo DomoApps/domo.js --limit 3   # find the run
gh run view <run-id> --repo DomoApps/domo.js --log                    # the decision and why

npm view ryuu.js dist-tags                                             # what's published
```

Or in the UI: **Actions → Release → Run workflow**. Each run's summary page shows what it decided and why.

## Settings

Changing variables, secrets and environments needs admin access to the repo.

### Repository variables

UI: **Settings → Secrets and variables → Actions → Variables**

| Variable | Value | What it does |
|---|---|---|
| `RELEASE_ENABLED` | `true` | Merges, the daily schedule and follow-up runs release automatically. Any other value, or unset, means only runs you start by hand do anything |
| `JIRA_BASE_URL` | `https://domoinc.atlassian.net` | The Jira site that's searched for bugs |
| `JIRA_PROJECTS` | `DOMO` | Comma-separated Jira projects that are searched |

```bash
gh variable set RELEASE_ENABLED --body true  --repo DomoApps/domo.js   # turn automatic releases on
gh variable set RELEASE_ENABLED --body false --repo DomoApps/domo.js   # pause them
gh variable set JIRA_PROJECTS --body DOMO    --repo DomoApps/domo.js
gh variable list --repo DomoApps/domo.js
```

### Secrets (in the `release` environment)

UI: **Settings → Environments → release → Environment secrets**

| Secret | What it is |
|---|---|
| `RELEASE_DEPLOY_KEY` | The private half of the deploy key Release uses to push tags |
| `JIRA_EMAIL` | The Jira account Release searches as |
| `JIRA_API_TOKEN` | An API token for that account. These expire, so put rotation on a calendar |

```bash
gh secret set RELEASE_DEPLOY_KEY --env release --repo DomoApps/domo.js < ryuu-release
gh secret set JIRA_EMAIL        --env release --repo DomoApps/domo.js   # prompts for the value
gh secret set JIRA_API_TOKEN    --env release --repo DomoApps/domo.js
gh secret list --env release --repo DomoApps/domo.js
```

### Run workflow options

UI: **Actions → Release → Run workflow**

| Option | Default | What it does |
|---|---|---|
| `dry_run` | on | Plan, build, test and compare, but push and publish nothing |
| `force_rc` | off | Promote the newest beta to rc now, skipping the beta soak and the Jira check |
| `force_ga` | off | Release the newest rc to `latest` now, skipping the 7-day rc soak and the Jira check |
| `simulate_now` | empty | Dry runs only: plan as if it were `+15d` from now, or an ISO time |

```bash
gh workflow run release.yml --repo DomoApps/domo.js -f dry_run=false                 # a real run
gh workflow run release.yml --repo DomoApps/domo.js -f dry_run=false -f force_rc=true
gh workflow run release.yml --repo DomoApps/domo.js -f dry_run=false -f force_ga=true
```

### PR labels

UI: the **Labels** box in the PR's sidebar.

| Label | What it does |
|---|---|
| `release:hotfix` | When the PR merges, its release goes straight to `latest`. It must be on the PR before it merges. See [Hotfixes](#hotfixes) |

```bash
gh pr edit <number> --add-label release:hotfix --repo DomoApps/domo.js
gh pr edit <number> --remove-label release:hotfix --repo DomoApps/domo.js
```

### Environment variables for `npm run release:plan`

| Variable | Example | What it does |
|---|---|---|
| `SIMULATE_NOW` | `+15d`, `2026-12-01T00:00:00Z` | Plan as if it were that time |
| `MASTER_REF` | `HEAD` | Plan as if this ref were `master` (default `origin/master`) |
| `FORCE_RC`, `FORCE_GA` | `true` | Same as the Run workflow options |
| `JIRA_*` | see above | Only needed when a promotion is due |

### Changing the rules

Change these with a PR.

| To change | Edit |
|---|---|
| The soak lengths | `BETA_SOAK_DAYS` (7), `BETA_QUIET_DAYS` (3) and `RC_SOAK_DAYS` (7) in `scripts/ci/lib.ts` |
| The hotfix label's name | `HOTFIX_LABEL` in `scripts/ci/lib.ts` |
| Which Jira resolutions don't count as bugs | `NON_BUG_RESOLUTIONS` in `scripts/ci/lib.ts` |
| When the daily run happens | The `cron` line in `.github/workflows/release.yml` |
| The version line (e.g. start 6.1.0) | `version` in `master`'s `package.json`. Only its X.Y.Z is read, as a minimum |

## One-time setup

**Who can publish:** only a reviewed merge to `master`, or a repo admin. Only the deploy key and admins can create `v*` tags, and the deploy key is only available to jobs running on `master`.

1. **Environments.** In the UI: **Settings → Environments → New environment**, then under Deployment branches and tags choose Selected. Create `release` allowing branch `master`, and `npm-publish` allowing tags `v*`. Or from the CLI:
   ```bash
   for env in release npm-publish; do
     gh api -X PUT repos/DomoApps/domo.js/environments/$env \
       -F 'deployment_branch_policy[protected_branches]=false' \
       -F 'deployment_branch_policy[custom_branch_policies]=true'
   done
   gh api -X POST repos/DomoApps/domo.js/environments/release/deployment-branch-policies -f name=master -f type=branch
   gh api -X POST repos/DomoApps/domo.js/environments/npm-publish/deployment-branch-policies -f name='v*' -f type=tag
   ```
2. **Deploy key.** UI: **Settings → Deploy keys → Add deploy key**, with **Allow write access** checked. Or:
   ```bash
   ssh-keygen -t ed25519 -N '' -C ryuu-release -f ryuu-release
   gh repo deploy-key add ryuu-release.pub --allow-write --title ryuu-release --repo DomoApps/domo.js
   gh secret set RELEASE_DEPLOY_KEY --env release --repo DomoApps/domo.js < ryuu-release
   rm ryuu-release ryuu-release.pub
   ```
3. **Jira secrets and the variables** listed under [Settings](#settings). Leave `RELEASE_ENABLED` off for now.
4. **The hotfix label.** UI: **Issues → Labels → New label**. Or:
   ```bash
   gh label create release:hotfix --color B60205 --description "Release straight to latest after merge" --repo DomoApps/domo.js
   ```
5. **npm trusted publisher**, added by an npm maintainer of `ryuu.js`: on npmjs.com, open the package's **Settings → Trusted publishing** and add GitHub Actions with repo `DomoApps/domo.js`, workflow `publish.yml`, environment `npm-publish`. No npm token is stored anywhere. After the first publish works, set publishing access to disallow tokens.
6. **Rulesets** (UI: **Settings → Rules → Rulesets**):
   - On `master`, require the `build-test` status check.
   - On tags `v*`, restrict creations, updates and deletions.
   - On branches `release/v*`, restrict creations, updates and deletions, and block force pushes.
   - Both bypass for **Deploy keys** and the **Repository admin** role.
   - Don't add PR or linear-history rules to `release/v*`.
7. **First run.** Do a dry run, then a real run (`dry_run=false`). Check that `npm view ryuu.js dist-tags` shows the new beta and that `latest` hasn't changed. Then set `RELEASE_ENABLED=true`.

## Recovery

- **A publish failed after its tag was pushed.** The next run retries it automatically while `RELEASE_ENABLED` is on; otherwise start a run yourself. Re-running Publish on a tag that's already on npm does nothing.
- **A hotfix stopped partway**, for example at the beta. Releases were paused, or a step failed. Start Release with Run workflow (`dry_run` off). The hotfix marker is on the tag, so the next step still skips its soak.
- **A tag can never publish.** Its "Verify the tag" step keeps failing, which holds everything else up. It wasn't made by the pipeline. An admin deletes the tag, plus `release/vX.Y.Z` if there is one, then starts a run. **Never create `v*` tags or `release/v*` branches by hand.**
- **A push is rejected by a ruleset.** The deploy key is missing, read-only, or not in the bypass list. Nothing was pushed. Fix the key or the ruleset, then start a run.
- **An rc or GA refused because its package differs from the soaked one.** Builds have been byte-for-byte reproducible, so this means something real changed, for example the runner's toolchain. Investigate before forcing.
- **A fix to `publish.yml` or `scripts/ci/verify-tag.sh` doesn't apply to an existing tag.** Each tag runs its own copy of both files.
- **The daily run stopped.** GitHub disables scheduled workflows after 60 days without repository activity. Re-enable it under **Actions → Release**.
- **Rolling back `latest`:** an npm maintainer runs `npm dist-tag add ryuu.js@<previous> latest`. Release never moves `latest` backwards, and never releases a version at or below it.

The scripts behind the workflows live in `scripts/ci/`. The decision logic is in `lib.ts`, which the `ci` Jest project tests.
