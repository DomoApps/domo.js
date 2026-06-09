---
description: Triage a Jira ticket — score its clarity and either request missing info or document a root cause hypothesis
argument-hint: [DOMO-XXXXX]
---

First, run `/clear` to reset the context before doing anything else.

You are triaging a Jira ticket. Follow these steps exactly.

## Step 0: Preflight — verify superpowers is installed

Before any other step, run:

```bash
test -d ~/.claude/plugins/cache/claude-plugins-official/superpowers && echo installed || echo missing
```

If output is `missing`, abort with this exact message and stop:

> This command requires the `superpowers` plugin. Install it with:
>
> `/plugin install superpowers@claude-plugins-official`
>
> Then re-run `/triage [TICKET-ID]`.

Do NOT proceed to any other step if superpowers is missing.

## Jira API Access

**Primary**: Use MCP tools (`mcp__jira__jira_get_issue`).

**Fallback** (only if MCP fails): Read `~/.claude/jira.apikey` (format: `email:api-token`) and use `curl -s -u "$(cat ~/.claude/jira.apikey)"` against `https://domoinc.atlassian.net/rest/api/3/`.

## Step 1: Resolve Ticket ID

**If `$ARGUMENTS` matches a ticket pattern** (e.g., `DOMO-12345`, `PROJ-678` — `LETTERS-DIGITS`):
- Store the ticket ID and proceed to Step 2.

**If `$ARGUMENTS` is empty or doesn't match**:
- If non-empty, warn: "Argument '[value]' doesn't look like a valid ticket ID."
- Search for the user's active tickets:
  1. `assignee = currentUser() AND status in ("In Progress", "Reopened") ORDER BY updated DESC` (limit 10)
  2. If empty, broaden: `assignee = currentUser() AND status not in (Done, Resolved, Closed) ORDER BY priority DESC, updated DESC` (limit 10)
- Present tickets via `AskUserQuestion` so the user can select one.

## Step 2: Fetch Ticket Details

Use `mcp__jira__jira_get_issue` with:
- fields: `summary,description,status,priority,assignee,issuetype,labels,components,comment,issuelinks,subtasks,parent,attachment,created,updated`
- comment_limit: 10

### Step 2a: Fetch parent

If the ticket has a `parent` field, fetch the parent with fields: `summary,status,description` (comment_limit: 0).

### Step 2b: Fetch linked tickets

Collect all linked ticket IDs from **two sources**:

1. **Jira issue links**: every entry in the `issuelinks` array — extract the key from `issuelinks[].inwardIssue.key` or `issuelinks[].outwardIssue.key`.
2. **Inline description references**: scan the `description` text for ticket ID patterns (`[A-Z]+-\d+`, e.g. `DOMO-12345`). Include any that are distinct from the primary ticket.

For each unique linked ticket ID found, fetch it with fields: `summary,status,description,comment` (comment_limit: 10).

**Read linked tickets chronologically** (oldest first). Treat the ticket chain as a continuous story: each newer ticket inherits everything established in prior tickets. Build a running log of:
- What has already been tried or confirmed (do NOT re-ask about these)
- What was resolved or ruled out (e.g., a workaround that worked partially)
- What remains unexplained or still fails despite prior attempts

If the current ticket says "in continuation of [PRIOR-TICKET]", that prior ticket's reproduction steps, environment details, and troubleshooting outcomes are all considered established facts — treat them as if they appeared in the current ticket's description.

### Step 2c: Assess ticket freshness

Compute the ticket age from the `created` and `updated` fields:
- **Created**: how long ago the ticket was filed
- **Last updated**: how long since any activity (comments, status changes, edits)

Apply these thresholds based on **last updated** date:

| Last Updated | Staleness Level | Action |
|---|---|---|
| < 6 months | Fresh | Proceed normally |
| 6–12 months | Aging | Note in output; proceed |
| > 12 months | Stale | Warn user via `AskUserQuestion`: "This ticket was last updated [N months/years] ago (created [date]). It may no longer be relevant. Proceed with triage?" Options: "Yes, proceed" / "No, skip". If skipped, stop and report: "Triage skipped — ticket appears stale." |

Include the freshness status in the final triage output (see Step 5 changes below).

## Step 3: Score Ticket Clarity (1–10)

Score the **total available information** across the entire ticket chain — not just the current ticket in isolation. Context established in prior linked tickets (reproduction steps, environment, root cause attempts, confirmed workarounds) counts toward the score if it is referenced or inherited by the current ticket.

| Dimension | Max Points | Criteria |
|-----------|-----------|----------|
| **Description quality** | 3 | 3 = detailed with context & steps (including inherited context from prior tickets); 2 = adequate but thin; 1 = minimal; 0 = absent or single sentence |
| **Acceptance criteria / expected behavior** | 2 | 2 = clear and testable; 1 = vague or implicit; 0 = missing |
| **Reproduction steps / user flow** | 2 | 2 = specific, reproducible steps (may live in a prior ticket); 1 = general description; 0 = none across the whole chain |
| **Scope clarity** | 2 | 2 = clear scope and boundaries; 1 = somewhat clear; 0 = ambiguous |
| **Supporting context** | 1 | 1 = links, screenshots, logs, prior ticket history, or internal team comments provide useful signal; 0 = none |

**Internal team comments inform the score, not the comment**: If a developer, support engineer, or QA member has left a comment indicating a specific investigation direction or hypothesis, that raises the score — treat it as engineering context being present. However, do not restate or echo it in the Jira comment. The triage comment must contribute original analysis, not narrate what others said.

Compute the **Clarity Score** (sum of all dimensions, 1–10).

## Step 4: Determine Audience

Before composing any comment, identify the ticket type and apply the corresponding audience rules:

| Ticket type | Score < 7 (request info) | Score ≥ 7 (triage output) |
|-------------|--------------------------|---------------------------|
| **Bug** | Support crew — non-technical. Ask about observed behavior, user impact, environment, and workflow. No code references, stack traces, or API terms. | Developer(s) — technical. Root cause hypothesis, component names, code areas, request/response details. |
| **Story / Improvement / Task** | Project Manager and/or developer. Ask about acceptance criteria, scope boundaries, priority rationale, and success definition. Keep questions business-oriented unless the gap is clearly technical. | Developer(s) — technical. Implementation approach, affected systems, edge cases, integration points. |

Write every comment to its intended audience. A Support agent should not need to decode a technical hypothesis. A developer should not receive vague business-speak when they need a code pointer.

All comments must be brief: no more than 4–5 sentences or bullet points total. Say only what is necessary.

## Step 4.5: Identify Code Owner

Based on the code areas identified in your analysis, determine the owning team:

1. Read the CODEOWNERS file at `CODEOWNERS` (repo root).
2. For each relevant file path or directory you've identified (from the ticket description, linked tickets, or your hypothesis), find the **last matching pattern** in CODEOWNERS — the last match wins per CODEOWNERS precedence rules.
3. Resolve the owning team:
   - If the match is `@domo-development/content-distribution` → set **Recommended Team** to `null` (we own it; no recommendation needed).
   - If the match is any other team or individual → set **Recommended Team** to that value.
   - If no pattern matches the relevant paths, or the matched pattern has no owner listed → set **Recommended Team** to the string `"No codeowner recommended"`.
4. Include the Recommended Team in the Jira comment only when it is non-null (see Step 5 templates).

## Step 5: Branch on Score

### If Clarity Score < 7 — Interactive Gap Resolution (then maybe request more info)

Adopt brainstorming-style discipline (one question at a time, multiple choice when possible) WITHOUT invoking the brainstorming skill literally — its hard-gate (no implementation action until design approved) and terminal state (invoke writing-plans) don't fit triage. We're filling info gaps, not designing software.

**Initialize:**
- `developer_context = []`  (buffer for answers)
- `skip_count = 0`

**Identify which scoring dimensions are gapped** (description quality / acceptance criteria / repro steps / scope / supporting context). Rank them by impact on score advancement (the dimension closest to its max-point cap if filled).

**Loop:**

1. Pick the highest-impact gapped dimension.
2. Use `AskUserQuestion` to ask one question targeting that dimension. Prefer multiple-choice options when applicable. ALWAYS include these standard options in addition to dimension-specific ones:
   - "I don't know — skip"
   - "Post the comment to Jira now (stop the Q&A)"
   - "Abort triage"
3. On answer:
   - If "I don't know — skip" → increment `skip_count`. If `skip_count >= 3`, exit loop with status `gave_up`.
   - If "Post the comment to Jira now" → exit loop with status `early_exit`.
   - If "Abort triage" → stop the entire command. Do not post anything.
   - Otherwise → append the answer to `developer_context`, reset `skip_count = 0`, **re-score** the ticket. Re-scoring rule: developer answers can lift any dimension they directly address. If the answer provides reproduction steps, the "Reproduction steps / user flow" dimension is re-evaluated. If the answer clarifies acceptance criteria, the "Acceptance criteria" dimension is re-evaluated. Etc. Score each dimension as you would if the answer had been in the original ticket text.
4. After re-score, branch:
   - If new score ≥ 7 → exit loop with status `advanced`.
   - Else → loop again.

**Exit handling:**

- `advanced`: proceed to the ≥ 7 path below. Pass `developer_context` along — it will be folded into the supporting context the systematic-debugging skill consumes.
- `gave_up` or `early_exit`: fall back to the existing post-comment-to-Jira behavior. Compose a Jira comment directed at the appropriate audience (see Step 4):
  1. If `developer_context` is non-empty, prefix the comment with a "Developer added during triage:" section listing each answer concisely.
  2. Then list 2–3 specific questions about what is still missing — prioritized by impact on reproducibility or scope definition.
  3. Each question must be something not already in the ticket chain OR `developer_context`.
  4. Phrase questions plainly, matched to audience.
  5. If **Recommended Team** is non-null (from Step 4.5), append: `Recommended Team: [value]`.

**Before posting**, show the user the exact comment text and use `AskUserQuestion` to ask: "Post this comment to [TICKET-ID]?" with options "Yes, post it" and "No, cancel". On approval, post via `mcp__jira__jira_add_comment`.

Then report to the user:

```
## Triage: [TICKET-ID]
**Clarity Score**: [X]/10[If developer_context non-empty: (advanced from [Y] via developer Q&A)] — Insufficient for implementation

### Ticket Age
Created: [date] · Last updated: [date] ([N months/years] ago) · Status: [Fresh/Aging/Stale]

### Developer-provided context (during triage)
[Bullet list from developer_context, or "None"]

### Missing Information (comment posted to [audience])
[Bullet list of what was requested]

### Recommended Team
[Owner from CODEOWNERS, or "No codeowner recommended", or omit section if content-distribution]

✅ Triage complete. Comment posted to Jira.
```

**Stop here.** Do not route to any other agent, attempt to fix the issue, or suggest additional steps.

### If Clarity Score ≥ 7 — Document Root Cause Hypothesis

Invoke `superpowers:systematic-debugging` to shape the hypothesis. Provide the skill with:
- The full ticket chain (description, parent, linked tickets, comments)
- `developer_context` if Step 5 < 7 advanced into this path
- Any code-area signals identified during scoring

The skill walks symptom → mechanism → root cause and identifies disconfirmation steps. Map its output to the existing Jira comment template:

- The skill's hypothesis statement → "Most likely root cause" line
- The skill's disconfirmation tests → "Investigation starting points"
- Any disconfirmation step that requires external info (logs, env, etc.) the skill couldn't answer locally → "Open questions"

**The comment must add net-new information.** Do not restate the problem, summarize the ticket, echo what a team member already said, or narrate the ticket history. The reader already knows all of that. Every sentence must be something they could not read elsewhere in the thread.

Compose a Jira comment directed at the developer(s) (see Step 4). The comment must contain only:
1. The most likely root cause — your original technical hypothesis based on the full ticket chain. State the mechanism, not the symptom.
2. 1–2 specific code-level starting points (component, file area, API endpoint, or code path) where the developer should begin investigation.
3. Any open questions that would confirm or refute the hypothesis — only if they are not already answerable from the existing thread.
4. If **Recommended Team** is non-null (from Step 4.5), append a final line: `Recommended Team: [value]`.

**Before posting**, show the user the exact comment text that will be posted and use `AskUserQuestion` to ask: "Post this comment to [TICKET-ID]?" with options "Yes, post it" and "No, cancel". If approved, post via `mcp__jira__jira_add_comment`. If cancelled, do not post and note that no comment was posted.

Then report to the user:
```
## Triage: [TICKET-ID]
**Clarity Score**: [X]/10 — Sufficient for implementation
[If advanced from <7:] (advanced from [Y] via developer Q&A)

### Ticket Age
Created: [date] · Last updated: [date] ([N months/years] ago) · Status: [Fresh/Aging/Stale]

### Root Cause Hypothesis
[Your hypothesis]

### Investigation Starting Points
[Where to look first]

### Open Questions (non-blocking)
[Any remaining questions]

### Recommended Team
[Owner from CODEOWNERS, or "No codeowner recommended", or omit section if content-distribution]

✅ Triage complete. Comment posted to Jira.
```

Use `AskUserQuestion` to ask: "Continue to /ticket for [TICKET-ID]?" with options "Yes, start /ticket" and "No, stop here". If yes, invoke the `/ticket` skill with the ticket ID as the argument. If no, stop.

## Comment Formatting

Every comment posted to Jira must:

1. Open with this exact header line (outside the code block):
   `🤖 AI-generated triage comment — review before acting on this.`
2. Wrap the full comment body in a Jira `{code}` block:
   ```
   🤖 AI-generated triage comment — review before acting on this.
   {code}
   <comment body here>
   {code}
   ```

The `{code}` block renders as a monospace panel in Jira, making AI-generated content visually distinct from human comments.

## Tone

- Constructive and specific — no generic feedback.
- Assume good intent from the ticket author.
- Focus on what is needed to move work forward.
