// CLI for the release workflow: gathers npm, git and Jira state, asks lib.ts what to
// do, and writes the decision to $GITHUB_OUTPUT. Usage: node release.js plan|stable

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { checkAccess, bugJql, JiraConfig, search } from './jira';
import {
  Action,
  blockers,
  BugCheck,
  NON_BUG_RESOLUTIONS,
  parse,
  planRelease,
  planStable,
  simulatedNow,
  State,
  TagInfo,
} from './lib';

const PACKAGE = 'ryuu.js';
const MASTER = process.env.MASTER_REF || 'origin/master';

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

function readNpm(): State['npm'] {
  const view = JSON.parse(sh('npm', ['view', PACKAGE, 'versions', 'time', 'dist-tags', '--json', '--prefer-online']));
  return { versions: view.versions, time: view.time, distTags: view['dist-tags'] };
}

function readTags(): Record<string, TagInfo> {
  const refs = sh('git', ['for-each-ref', 'refs/tags', '--format=%(refname:short) %(objectname) %(*objectname)'])
    .split('\n')
    .map((line) => line.split(' '))
    .filter(([name]) => name?.startsWith('v') && parse(name.slice(1)) !== null)
    .map(([name, obj, peeled]) => ({ version: name.slice(1), sha: peeled || obj }));
  if (!refs.length) return {};

  const parents = new Map(
    sh('git', ['log', '--no-walk=unsorted', '--format=%H %P', ...new Set(refs.map((r) => r.sha))])
      .split('\n')
      .map((line) => line.split(' ') as [string, string]),
  );
  return Object.fromEntries(refs.map((r) => [r.version, { sha: r.sha, parent: parents.get(r.sha) ?? '' }]));
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

function report(mode: string, s: State, action: Action): void {
  const fields: Record<string, string> = { action: action.kind, reason: action.reason };
  if ('version' in action) fields.version = action.version;
  if ('from' in action) fields.from = action.from;
  if ('compare' in action) fields.compare = action.compare ?? '';

  console.log(`${mode}: ${JSON.stringify(fields, null, 2)}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(fields).map(([k, v]) => `${k}=${v}\n`).join(''));
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const tags = s.npm.distTags;
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### ${mode}: \`${action.kind}\` ${'version' in action ? `\`${action.version}\`` : ''}\n\n${action.reason}\n\n` +
        `latest \`${tags.latest ?? '-'}\` · beta \`${tags.beta ?? '-'}\` · stable \`${tags.stable ?? '-'}\` · ` +
        `master \`${s.masterSha.slice(0, 7)}\` (${s.masterVersion}) · now ${s.now.toISOString()}\n`,
    );
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== 'plan' && mode !== 'stable') throw new Error('usage: release.js plan|stable');

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
  const bugs = jiraBugCheck();
  const action =
    mode === 'plan'
      ? await planRelease(state, bugs, { forceGa: process.env.FORCE_GA === 'true' })
      : await planStable(state, bugs);
  report(mode, state, action);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
