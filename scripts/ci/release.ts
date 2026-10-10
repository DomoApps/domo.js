// CLI for the release workflow: gathers npm, git and Jira state, asks lib.ts what to
// do, and writes the decision to $GITHUB_OUTPUT. Usage: node release.js plan

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { GitHubConfig, labelledPrs } from './github';
import { checkAccess, bugJql, JiraConfig, search } from './jira';
import {
  Action,
  blockers,
  BugCheck,
  HOTFIX_LABEL,
  HOTFIX_ROLES,
  HotfixCheck,
  NON_BUG_RESOLUTIONS,
  parseTagRefs,
  planRelease,
  simulatedNow,
  State,
  TagInfo,
} from './lib';

const PACKAGE = 'ryuu.js';
// Fully qualified: a tag named `origin/master` would otherwise shadow the remote-tracking branch.
const MASTER = process.env.MASTER_REF || 'refs/remotes/origin/master';

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

function readNpm(): State['npm'] {
  const view = JSON.parse(sh('npm', ['view', PACKAGE, 'versions', 'time', 'dist-tags', '--json', '--prefer-online']));
  return { versions: view.versions, time: view.time, distTags: view['dist-tags'] };
}

// prepare-release.sh writes "(hotfix)" into the annotation of every tag in a hotfix release.
function readTags(): Record<string, TagInfo> {
  const format = '%(refname:short)%09%(objecttype)%09%(objectname)%09%(*objectname)%09%(contents:subject)';
  const refs = parseTagRefs(sh('git', ['for-each-ref', 'refs/tags', `--format=${format}`]));
  if (!refs.length) return {};

  const parents = new Map(
    sh('git', ['log', '--no-walk=unsorted', '--format=%H %P', ...new Set(refs.map((r) => r.sha))])
      .split('\n')
      .map((line) => line.split(' ') as [string, string]),
  );
  return Object.fromEntries(
    refs.map((r) => [r.version, { sha: r.sha, parent: parents.get(r.sha) ?? '', hotfix: r.hotfix }]),
  );
}

// Does a merged PR since the last release carry a hotfix label that a maintainer applied before the merge?
function prHotfixCheck(): HotfixCheck {
  const cfg: GitHubConfig = {
    repo: process.env.GITHUB_REPOSITORY || 'DomoApps/domo.js',
    token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
    log: (message) => console.log(message),
  };
  return async (from, to) => {
    const shas = sh('git', ['rev-list', '--max-count=50', ...(from ? [`${from}..${to}`] : ['--max-count=1', to])])
      .split('\n')
      .filter(Boolean);
    const verdicts = new Map<number, boolean>();
    for (const sha of shas) {
      const prs = await labelledPrs(cfg, sha, HOTFIX_LABEL, HOTFIX_ROLES, verdicts);
      if (prs.length) {
        console.log(`PR #${prs[0]} (${sha.slice(0, 7)}) carries ${HOTFIX_LABEL}`);
        return true;
      }
    }
    return false;
  };
}

// Jira is only read once a gate's soak time has passed, so credentials are resolved lazily.
function jiraBugCheck(): BugCheck {
  let cfg: JiraConfig | null = null;
  let access: Promise<void> | null = null;
  return async (labels, since) => {
    cfg ??= {
      baseUrl: required('JIRA_BASE_URL'),
      email: required('JIRA_EMAIL'),
      token: required('JIRA_API_TOKEN'),
      projects: required('JIRA_PROJECTS').split(',').map((p) => p.trim()).filter(Boolean),
    };
    access ??= checkAccess(cfg);
    await access;
    const issues = await search(cfg, bugJql(cfg.projects, labels));
    const found = blockers(issues, since, NON_BUG_RESOLUTIONS);
    console.log(`Jira: ${issues.length} bug(s) labelled ${labels.join(', ')}; blocking since ${since.toISOString()}: ${found.join(', ') || 'none'}`);
    return found;
  };
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

function report(s: State, action: Action): void {
  const fields: Record<string, string> = { action: action.kind, reason: action.reason };
  if ('version' in action) fields.version = action.version;
  if ('from' in action) fields.from = action.from;
  if ('compare' in action) fields.compare = action.compare ?? '';
  if ('hotfix' in action) fields.hotfix = String(action.hotfix);

  console.log(`plan: ${JSON.stringify(fields, null, 2)}`);
  if (process.env.GITHUB_OUTPUT) {
    // One line per value: a newline in any of them would inject extra outputs.
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(fields)
        .map(([k, v]) => `${k}=${v.replace(/[\r\n]+/g, ' ')}\n`)
        .join(''),
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const tags = s.npm.distTags;
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Release plan: \`${action.kind}\` ${'version' in action ? `\`${action.version}\`` : ''}\n\n${action.reason}\n\n` +
        `latest \`${tags.latest ?? '-'}\` · rc \`${tags.rc ?? '-'}\` · beta \`${tags.beta ?? '-'}\` · ` +
        `master \`${s.masterSha.slice(0, 7)}\` (${s.masterVersion}) · now ${s.now.toISOString()}\n`,
    );
  }
}

async function main(): Promise<void> {
  if (process.argv[2] !== 'plan') throw new Error('usage: release.js plan');

  const dryRun = process.env.DRY_RUN === 'true';
  const simulate = process.env.SIMULATE_NOW ?? '';
  if (simulate && !dryRun) throw new Error('simulate_now is only allowed with dry_run');

  const state: State = {
    now: simulatedNow(simulate, new Date()),
    masterVersion: JSON.parse(sh('git', ['show', `${MASTER}:package.json`])).version,
    masterSha: sh('git', ['rev-parse', `${MASTER}^{commit}`]),
    npm: readNpm(),
    tags: readTags(),
  };
  const action = await planRelease(
    state,
    jiraBugCheck(),
    { forceRc: process.env.FORCE_RC === 'true', forceGa: process.env.FORCE_GA === 'true' },
    prHotfixCheck(),
  );
  report(state, action);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
