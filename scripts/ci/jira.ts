// Minimal Jira Cloud client for the release gates. Resolution names and dates are
// filtered in lib.ts, not JQL: names vary by project and JQL dates use the token
// owner's timezone.

import type { JiraIssue } from './lib';

export interface JiraConfig {
  baseUrl: string;
  email: string;
  token: string;
  projects: string[];
  fetchFn?: typeof fetch;
}

interface SearchPage {
  issues: Array<{
    key: string;
    fields: {
      created: string;
      status: { statusCategory: { key: string } };
      resolution: { name: string } | null;
    };
  }>;
  nextPageToken?: string;
  isLast?: boolean;
}

const quote = (s: string) => `"${s.replace(/["\\]/g, '\\$&')}"`;

function projectClause(projects: string[]): string {
  return `project in (${projects.map(quote).join(', ')}) AND issuetype = Bug`;
}

export function bugJql(projects: string[], labels: string[]): string {
  return `${projectClause(projects)} AND labels in (${labels.map(quote).join(', ')})`;
}

export async function search(cfg: JiraConfig, jql: string, limit = Infinity): Promise<JiraIssue[]> {
  const fetchFn = cfg.fetchFn ?? fetch;
  const maxResults = Math.min(100, limit);
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/rest/api/3/search/jql`;
  const auth = Buffer.from(`${cfg.email}:${cfg.token}`).toString('base64');
  const found: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  do {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jql, maxResults, fields: ['created', 'status', 'resolution'], nextPageToken }),
    });
    if (!res.ok) throw new Error(`Jira search failed: ${res.status} ${await res.text()}`);

    const page = (await res.json()) as SearchPage;
    for (const i of page.issues) {
      found.push({
        key: i.key,
        created: i.fields.created,
        statusCategory: i.fields.status.statusCategory.key,
        resolution: i.fields.resolution?.name ?? null,
      });
    }
    nextPageToken = page.isLast === false ? page.nextPageToken : undefined;
  } while (nextPageToken && found.length < limit);

  return found;
}

/** A gate that can't see any bugs would always pass; prove the token can read the projects first. */
export async function checkAccess(cfg: JiraConfig): Promise<void> {
  const found = await search(cfg, projectClause(cfg.projects), 1);
  if (!found.length) {
    throw new Error(`Jira token sees no Bug issues in ${cfg.projects.join(', ')}; check JIRA_EMAIL/JIRA_API_TOKEN permissions`);
  }
}
