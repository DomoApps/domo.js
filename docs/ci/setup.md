# CI/CD Pipeline — Operator Runbook

## One-time setup

1. **Bot identity** — provision `ryuu-ci-bot` (machine user or GitHub App). See `docs/superpowers/specs/2026-04-24-cicd-github-actions-design.md` §12.
2. **npm access** — bot must be a maintainer of `ryuu.js` (or have a write-scoped token).
3. **Repo secrets** — set `NPM_TOKEN`, `BOT_APP_ID`, `BOT_APP_PRIVATE_KEY`, `JIRA_BASE_URL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`. `JIRA_API_TOKEN` is a Personal Access Token from Jira DC (Profile → Personal Access Tokens).
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

**Note on dist-tags:** newly published stable versions are tagged `stable` (not `latest`). Customers who don't pin a version receive whatever `latest` points to. The maintainer moves `latest` via the `Promote Latest` workflow when ready for general consumption.

## Recovery

- **`npm publish` failed with "version exists"** — package.json is out of sync with npm. Manually fast-forward `package.json.version` to one above the highest published, then re-trigger the workflow.
- **Bot push rejected** — branch protection bypass is misconfigured. Add the bot to the bypass list.
- **Stable was published but tag push failed** — manually `git tag vX.Y.Z` and `git push origin vX.Y.Z`.
- **`cut-beta` succeeded creating the release branch but failed to roll master forward** — the system is now blocked because the new `release/v*` branch with `-beta` prevents future cut-betas. Recovery options: (a) manually push the master version-bump commit (you can find what it should be from the `cut-beta.yml` run logs and amending `package.json` directly), or (b) delete the new release branch (`git push origin --delete release/vX.Y.Z`) and re-run `Cut Beta` — note this discards any `-beta.0` already published to npm.

## Conventions

- Jira tickets that should block promotion must have label `version:<base>-<phase>` (e.g. `version:6.0.3-alpha`) and priority Critical or Major.
- Parent aggregator tickets remain at default priority and are not seen by the soak gate.
