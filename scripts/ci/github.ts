// Looks up the pull request labels behind master commits, for the hotfix label.

export interface GitHubConfig {
  repo: string;
  token?: string;
  fetchFn?: typeof fetch;
}

interface PullRequest {
  number: number;
  merged_at: string | null;
  labels: Array<{ name: string }>;
}

/** Numbers of the merged pull requests that introduced `sha` and carry `label`. */
export async function labelledPrs(cfg: GitHubConfig, sha: string, label: string): Promise<number[]> {
  const fetchFn = cfg.fetchFn ?? fetch;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;

  const res = await fetchFn(`https://api.github.com/repos/${cfg.repo}/commits/${sha}/pulls`, { headers });
  // 422 means GitHub has never seen the commit (e.g. a local rehearsal), so no PR introduced it.
  if (res.status === 422) return [];
  if (!res.ok) throw new Error(`GitHub pull request lookup failed: ${res.status} ${await res.text()}`);

  const prs = (await res.json()) as PullRequest[];
  return prs.filter((p) => p.merged_at && p.labels.some((l) => l.name === label)).map((p) => p.number);
}
