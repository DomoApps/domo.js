// Decides whether a merged PR carries a trustworthy `release:hotfix` label. A hotfix skips both soaks and
// the Jira check, so the label only counts if a maintainer or admin applied it before the PR merged.

export interface GitHubConfig {
  repo: string;
  token?: string;
  fetchFn?: typeof fetch;
  /** Called with a one-line reason whenever a labelled PR is ignored. */
  log?: (message: string) => void;
}

interface PullRequest {
  number: number;
  merged_at: string | null;
  labels: Array<{ name: string }>;
}

interface IssueEvent {
  event: string;
  created_at: string;
  label?: { name: string };
  actor?: { login: string } | null;
}

const MAX_EVENT_PAGES = 10;

async function get(cfg: GitHubConfig, path: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
  return (cfg.fetchFn ?? fetch)(`https://api.github.com/repos/${cfg.repo}${path}`, { headers });
}

/**
 * Numbers of the merged pull requests that introduced `sha` and carry a `label` that was applied before the
 * merge by a user holding one of `roles`. `verdicts` caches the answer per PR across commits.
 */
export async function labelledPrs(
  cfg: GitHubConfig,
  sha: string,
  label: string,
  roles: string[],
  verdicts: Map<number, boolean> = new Map(),
): Promise<number[]> {
  const res = await get(cfg, `/commits/${sha}/pulls`);
  // 422 means GitHub has never seen the commit (e.g. a local rehearsal), so no PR introduced it.
  if (res.status === 422) return [];
  if (!res.ok) throw new Error(`GitHub pull request lookup failed: ${res.status} ${await res.text()}`);

  const prs = (await res.json()) as PullRequest[];
  const found: number[] = [];
  for (const p of prs) {
    if (!p.merged_at || !p.labels.some((l) => l.name === label)) continue;
    if (!verdicts.has(p.number)) verdicts.set(p.number, await labelCounts(cfg, p, label, roles));
    if (verdicts.get(p.number)) found.push(p.number);
  }
  return found;
}

async function labelCounts(cfg: GitHubConfig, p: PullRequest, label: string, roles: string[]): Promise<boolean> {
  const ignore = (why: string) => {
    cfg.log?.(`PR #${p.number} has ${label} but it is ignored: ${why}`);
    return false;
  };

  const applied = lastApplication(await events(cfg, p.number), label);
  if (!applied) return ignore('no record of who applied it');
  if (new Date(applied.created_at) > new Date(p.merged_at as string)) return ignore('applied after the PR merged');

  const login = applied.actor?.login;
  if (!login) return ignore('the user who applied it is unknown');

  const res = await get(cfg, `/collaborators/${encodeURIComponent(login)}/permission`);
  // Apps, deleted users and non-collaborators have no permission record; they are not maintainers.
  if (res.status === 404 || res.status === 403) return ignore(`${login} is not a repository collaborator`);
  if (!res.ok) throw new Error(`GitHub permission lookup failed: ${res.status} ${await res.text()}`);

  const body = (await res.json()) as { role_name?: string; permission?: string };
  const role = body.role_name ?? body.permission ?? '';
  return roles.includes(role) ? true : ignore(`${login} has the ${role || 'unknown'} role, not ${roles.join(' or ')}`);
}

function lastApplication(all: IssueEvent[], label: string): IssueEvent | undefined {
  return all.filter((e) => e.event === 'labeled' && e.label?.name === label).pop();
}

async function events(cfg: GitHubConfig, number: number): Promise<IssueEvent[]> {
  const all: IssueEvent[] = [];
  for (let page = 1; page <= MAX_EVENT_PAGES; page++) {
    const res = await get(cfg, `/issues/${number}/events?per_page=100&page=${page}`);
    if (!res.ok) throw new Error(`GitHub event lookup failed: ${res.status} ${await res.text()}`);
    const batch = (await res.json()) as IssueEvent[];
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}
