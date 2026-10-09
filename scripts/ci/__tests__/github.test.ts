import { GitHubConfig, labelledPrs } from '../github';

function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const pr = (number: number, labels: string[], merged = true) => ({
  number,
  merged_at: merged ? '2026-10-09T12:00:00Z' : null,
  labels: labels.map((name) => ({ name })),
});

describe('labelledPrs', () => {
  it('asks GitHub for the pull requests that introduced the commit', async () => {
    const { fn, calls } = fakeFetch(200, []);
    const cfg: GitHubConfig = { repo: 'DomoApps/domo.js', token: 't0ken', fetchFn: fn };
    await labelledPrs(cfg, 'abc123', 'release:hotfix');
    expect(calls[0].url).toBe('https://api.github.com/repos/DomoApps/domo.js/commits/abc123/pulls');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer t0ken');
  });

  it('works without a token for local dry runs', async () => {
    const { fn, calls } = fakeFetch(200, []);
    await labelledPrs({ repo: 'DomoApps/domo.js', fetchFn: fn }, 'abc123', 'release:hotfix');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('returns only merged pull requests that carry the label', async () => {
    const { fn } = fakeFetch(200, [
      pr(101, ['bug', 'release:hotfix']),
      pr(102, ['bug']),
      pr(103, ['release:hotfix'], false),
    ]);
    expect(await labelledPrs({ repo: 'DomoApps/domo.js', fetchFn: fn }, 'abc123', 'release:hotfix')).toEqual([101]);
  });

  it('treats a commit GitHub has never seen (e.g. unpushed, in a local rehearsal) as having no PR', async () => {
    const { fn } = fakeFetch(422, { message: 'No commit found for SHA: abc123' });
    expect(await labelledPrs({ repo: 'DomoApps/domo.js', fetchFn: fn }, 'abc123', 'release:hotfix')).toEqual([]);
  });

  it('throws on a non-2xx response instead of treating the merge as a normal one', async () => {
    const { fn } = fakeFetch(403, { message: 'rate limited' });
    await expect(labelledPrs({ repo: 'DomoApps/domo.js', fetchFn: fn }, 'abc123', 'release:hotfix')).rejects.toThrow(
      /GitHub pull request lookup failed: 403/,
    );
  });
});
