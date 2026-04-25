export interface JiraConfig {
  baseUrl: string;
  apiToken: string;
  projectKey: string;
}

export async function countOpenBlockers(
  cfg: JiraConfig,
  versionLabel: string,
): Promise<number> {
  const jql =
    `project = "${cfg.projectKey}" AND labels = "${versionLabel}" ` +
    `AND priority in (Critical, Major) AND status != Done`;

  const res = await fetch(`${cfg.baseUrl}/rest/api/2/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ jql, fields: [], maxResults: 0 }),
  });

  if (!res.ok) {
    throw new Error(`Jira returned ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as { total: number };
  return body.total;
}
