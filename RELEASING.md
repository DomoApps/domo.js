# Releasing ryuu.js

Releases are automated by GitHub Actions. Nobody publishes from a laptop.

| npm dist-tag | What it points at | How it moves |
|---|---|---|
| `beta` | The newest build of the version in progress, e.g. `6.0.10-beta.3` | A merge to `master` that changes the published package |
| `latest` | The newest GA, e.g. `6.0.10`. `npm install ryuu.js` gets this | A beta that soaked **14 days** with no bugs |
| `stable` | A GA that has proven itself in the field | A GA that has been out **30 days** with no bugs |

## How a change ships

1. Open a PR to `master`. **PR Validate** runs type checks, tests, the build and a package check, and must pass.
2. After the merge, **Release** builds master as the next `X.Y.Z-beta.N`. If the packed tarball differs from the last published one, it tags `vX.Y.Z-beta.N` and publishes it under `beta`. A demo-, test- or devDependency-only merge ships nothing and doesn't restart the soak.
3. Every new beta restarts the 14-day clock. Once the newest beta has soaked 14 days with no blocking bugs, Release publishes `X.Y.Z` under `latest`, tags `vX.Y.Z` and creates `release/vX.Y.Z`. The next shippable merge starts `X.Y.(Z+1)-beta.0`.
4. Thirty days after a GA, if it has no blocking bugs, Release moves `stable` to it.

Release runs on every push to `master`, daily at 15:23 UTC, and on demand. Every run recomputes state from npm, git tags and Jira; nothing else is stored. Each run takes at most one irreversible step.

## Reporting a bug against a release

Add the label **`ryuu.js-X.Y.Z`** to the Jira **Bug** issue, using the version number without a beta suffix (`ryuu.js-6.0.10`, not `ryuu.js-6.0.10-beta.2`). Bugs labelled with a beta suffix are also counted, as a safety net.

A labelled bug blocks promotion when it is:
- **unresolved**, whenever it was reported; or
- **reported during the current soak**, and resolved as anything except Duplicate, Won't Do, Won't Fix, Cannot Reproduce or Not a Bug. Fixing it means shipping a new beta, which restarts the clock.

All priorities count. The Jira projects searched come from the `JIRA_PROJECTS` repo variable.

## Common tasks

| Task | How |
|---|---|
| See what Release would do | Actions → Release → Run workflow, with `dry_run` checked (the default). The run summary shows the decision and why. |
| Rehearse a future date | The same, with `simulate_now` set to `+15d` or an ISO timestamp. Only allowed in a dry run. |
| Ship the current beta as GA now | Run Release with `dry_run` unchecked and `force_ga` checked. This skips the soak **and** the Jira check. |
| Start a minor or major line | Open a PR setting `master`'s `package.json` `version` to e.g. `6.1.0-beta.0`. Only its `X.Y.Z` is read, as a floor. Any beta line still in progress is abandoned. |
| Pause automatic releases | Set the repo variable `RELEASE_ENABLED` to `false`. Manual dispatches still work. |
| Roll back `latest` | `npm dist-tag add ryuu.js@<previous> latest` as an npm maintainer. Release never moves `latest` backwards or tags anything above `latest` as stable. |

`master`'s `package.json` version is never bumped by CI. Published versions live only on `v*` tags and `release/v*` branches.

## Recovery

- **A run failed after pushing a tag but before publishing.** The next Release run sees the tag is missing from npm and re-dispatches Publish. That happens automatically while `RELEASE_ENABLED` is `true`; otherwise, dispatch Release yourself. Re-running Publish on a tag already on npm does nothing.
- **A tag can never publish** (Publish's "Verify the tag" step keeps failing, and Release keeps re-dispatching it, so no betas or GAs ship). The tag wasn't made by the pipeline, or was made by hand. An admin deletes it, plus `release/vX.Y.Z` if one was created for it, then dispatches Release. **Never create `v*` tags or `release/v*` branches by hand.** Hand-made GA tags are ignored, but a stray beta tag blocks the queue, and an existing `release/vX.Y.Z` makes that version's GA push fail.
- **A tag or branch push is rejected by a ruleset.** The deploy key is missing, read-only, or no longer in the bypass list (setup steps 3 and 6). Nothing was pushed, because the push is atomic. Fix the key or the ruleset, then dispatch Release.
- **A fix to `publish.yml` or `scripts/ci/verify-tag.sh` doesn't reach an existing tag.** Each tag runs its own copy of both, so a fix only applies to tags cut after it merges.
- **A GA failed because the artifact differs from the soaked beta.** Builds have been byte-for-byte reproducible so far, so a mismatch is a real problem (for example, a toolchain change on the runner). Investigate before forcing anything.
- **Jira errors.** A beta that's due for GA fails the run rather than silently passing or cutting a new beta. Fix the credentials; the next run retries.
- **Release stopped running on schedule.** GitHub disables cron workflows in public repos after 60 days without repository activity. Re-enable it under Actions → Release.
- **Failure emails.** Scheduled-run failures go to whoever last edited the `cron` line in `release.yml`.

## One-time setup

**Trust boundary:** only a reviewed merge to `master` (or a repo admin) can cause a publish. A `v*` tag is what triggers a publish, and only the `release` environment's deploy key and admins can create one. That environment is only available to jobs running on `master`.

1. GitHub Actions enabled for the repo (an org admin unblocks billing or policy), with GitHub-owned actions allowed.
2. Repo **variables**: `RELEASE_ENABLED` (`false` until the first live run checks out), `JIRA_BASE_URL` (`https://domoinc.atlassian.net`), `JIRA_PROJECTS` (`DOMO`).
3. **Deploy key**: generate one with `ssh-keygen -t ed25519 -N '' -C ryuu-release -f ryuu-release`. Add `ryuu-release.pub` under Settings → Deploy keys, with **Allow write access**. Store the private key as the `release` environment secret `RELEASE_DEPLOY_KEY`, then delete both local files.
4. **Environments**:
   - `release`, restricted to branch `master`. Its secrets are `RELEASE_DEPLOY_KEY`, plus `JIRA_EMAIL` and `JIRA_API_TOKEN` for an account that can browse the Jira projects. API tokens expire, so put rotation on a calendar.
   - `npm-publish`, restricted to tags `v*`.
   - `npm-dist-tag`, restricted to branch `master`.
5. **npm trusted publishers** for `ryuu.js`, added by a maintainer:
   - repo `DomoApps/domo.js`, workflow `publish.yml`, environment `npm-publish` (publish)
   - repo `DomoApps/domo.js`, workflow `release.yml`, environment `npm-dist-tag`, with **Allow npm dist-tag** (stable)

   After the first publish succeeds, set publishing access to disallow tokens.
6. **Rulesets**:
   - On `master`, require the `build-test` check (add it after it has passed once).
   - On tags `v*`: restrict creations, updates and deletions.
   - On branches `release/v*`: restrict creations, updates and deletions, and block force pushes.
   - Both rulesets bypass for **Deploy keys** and the **Repository admin** role.
   - Don't add PR or linear-history rules to `release/v*`; CI creates those branches with a plain push.

The scripts behind the workflows live in `scripts/ci/`. Decision logic is in `lib.ts`, unit-tested by the `ci` Jest project.
