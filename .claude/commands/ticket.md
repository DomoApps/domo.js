---
description: Fetch a Jira ticket, create a branch, and route to specialized agent
argument-hint: [DOMO-XXXXX]
---

You are helping the user work on a Jira ticket. Follow these steps precisely.

## Step 0: Preflight — verify superpowers is installed

Before doing anything else, run:

```bash
test -d ~/.claude/plugins/cache/claude-plugins-official/superpowers && echo installed || echo missing
```

If the output is `missing`, abort with this exact message and stop:

> This command requires the `superpowers` plugin. Install it with:
>
> `/plugin install superpowers@claude-plugins-official`
>
> Then re-run `/ticket [TICKET-ID]`.

Do NOT proceed to any other step if superpowers is missing.

## Jira API Access

**Primary**: Use MCP tools (`mcp__jira__jira_get_issue`, `mcp__jira__jira_search`).

**Fallback** (only if MCP fails): Read `~/.claude/jira.apikey` (format: `email:api-token`) and use `curl -s -u "$(cat ~/.claude/jira.apikey)"` against `https://domoinc.atlassian.net/rest/api/3/`.

## Step 1: Resolve Ticket ID

**If `$ARGUMENTS` matches a ticket pattern** (e.g., `DOMO-12345`, `PROJ-678` — `LETTERS-DIGITS`):
- Store the ticket ID and skip to Step 2.

**If `$ARGUMENTS` is empty or doesn't match**:
- If non-empty, warn: "Argument '[value]' doesn't look like a valid ticket ID. Showing your assigned tickets instead."
- Search for the user's active tickets:
  1. First try: `assignee = currentUser() AND status in ("In Progress", "Reopened") ORDER BY updated DESC` (limit 10)
  2. If empty, broaden: `assignee = currentUser() AND status not in (Done, Resolved, Closed) ORDER BY priority DESC, updated DESC` (limit 10)
- Present tickets via `AskUserQuestion`:
  - Options formatted as `DOMO-XXXXX: [Summary]` with description `Status: [status] · Priority: [priority] · Updated: [relative time]`
  - The "Other" option allows manual ticket ID entry

## Step 2: Fetch Ticket Details

### 2a: Primary ticket
Fetch with `mcp__jira__jira_get_issue`:
- fields: `summary,description,status,priority,assignee,issuetype,labels,components,comment,issuelinks,subtasks,parent,attachment,created,updated`
- comment_limit: 5

### 2b: Parent/Epic context
If the ticket has a `parent` field, fetch the parent with fields: `summary,status,description` (comment_limit: 0). Otherwise note "None."

### 2c: Linked issues
Extract `issuelinks` from the response. For each link, note the type, key, summary, and status. Group by link type.

### 2d: Sub-tasks
Extract `subtasks` array. Note each sub-task's key, summary, status, and priority.

### 2e: Attachments
If the `attachment` array is non-empty:
- List filenames and sizes
- Use `AskUserQuestion`: "This ticket has N attachment(s): [filenames]. Download for analysis?"
  - "Yes, download" → use `mcp__jira__jira_download_attachments` to `/tmp/jira-attachments/[TICKET-ID]/`
  - "No, skip" → continue

If no attachments, skip silently.

### 2f: Transition to "In Progress"
If the ticket isn't already "In Progress":
1. Get transitions via `mcp__jira__jira_get_transitions`
2. Find a transition containing "In Progress" (case-insensitive)
3. Execute via `mcp__jira__jira_transition_issue`
4. On failure: log a warning and continue (never block the workflow)
5. On success: inform user

### 2g: Assess ticket freshness

Compute ticket age from `created` and `updated` fields.

| Last Updated | Action |
|---|---|
| < 6 months | Proceed normally |
| 6–12 months | Inform user: "Note: This ticket was last updated [N months] ago." Continue. |
| > 12 months | Warn via `AskUserQuestion`: "This ticket was last updated [N months/years] ago (created [date]). The code or requirements may have changed significantly. Proceed?" Options: "Yes, proceed" / "No, abort". If aborted, stop. |

## Step 3: Prepare Git Environment

### 3a: Reset cost tracking
Clear the per-ticket agent activity log so cost tracking starts fresh for this ticket:
```bash
rm -f .claude/agent-activity-[TICKET-ID].log
```

### 3b: Precheck — main checkout must be clean

Run:
```bash
git -C . status --porcelain
```

If output is non-empty, abort with:

> Cannot create worktree: the main checkout has uncommitted changes:
>
> [paste git status output]
>
> Commit, stash, or discard these changes and re-run `/ticket [TICKET-ID]`.

This precheck is critical — Step 5 (validation) copies files into the main checkout for testing, and uncommitted work would be silently overwritten.

### 3c: Determine branch name

Read `branchPrefix` from `.claude/settings.local.json` (the `branchPrefix` key at the top level).

- If `branchPrefix` is defined and non-empty: branch name = `<branchPrefix>/<type>/[TICKET-ID]`
- If `branchPrefix` is absent or empty: derive the type slug from the ticket's `issuetype` and use `<type>/[TICKET-ID]`

Type slug mapping (case-insensitive match on issuetype name):

| Jira Issue Type | Slug |
|---|---|
| Bug | `bug` |
| Story | `story` |
| Task | `task` |
| Improvement | `story` |
| Epic | `epic` |
| Sub-task | `subtask` |
| _(anything else)_ | `task` |

Example: a Bug ticket `DOMO-12345` → branch `bug/DOMO-12345`

### 3d: Check if branch already exists

```bash
git fetch origin
git branch -a | grep <branch-name>
```

If the branch already exists locally or remotely, use `AskUserQuestion`: "Branch `<branch-name>` already exists. Switch to it (worktree from existing branch) or create fresh?"
- "Switch to existing" → use the existing branch in Step 3e
- "Create fresh from master" → delete the remote and local branch, then create a new branch in Step 3e

### 3e: Create the worktree via the superpowers skill

Invoke the `superpowers:using-git-worktrees` skill with:
- worktree path: `.worktrees/[TICKET-ID]` (relative to repo root)
- branch name: from Step 3c (or existing branch if user chose "Switch to existing")
- base branch: `master` (only when creating a fresh branch)

Capture the absolute worktree path as `WORKTREE_PATH` and the branch name (from Step 3c, or the existing branch if "Switch to existing" was chosen) as `BRANCH_NAME`.

All subsequent engineer file edits, git operations, and the eventual `gh pr create` happen inside `WORKTREE_PATH`. The main checkout is read-only for the rest of this command except for the temporary copy-back in Step 5.

If the skill fails (e.g., disk full, lock file present), abort with the skill's error message. Do NOT fall back to in-place checkout — the rest of the command assumes a worktree exists.

## Step 3.5: Pre-implementation routing (type-conditional)

The skill invocation depends on the ticket's `issuetype`. Determine routing using a case-insensitive match on the ticket's issuetype name:

### If issuetype is "Bug"

Invoke `superpowers:systematic-debugging`. Walk Phase 1 only — reproduce / confirm the symptom and capture initial hypotheses. Do NOT proceed to Phase 2 (the engineer continues from there).

Capture the Phase 1 output as an "Investigation primer" block. The block must include:
- Confirmed symptom (what is observed)
- Reproduction conditions (steps, environment, scope)
- 1–3 initial hypotheses ranked by likelihood

This block is appended verbatim to the engineer prompt in Step 4.

### If issuetype is "Story", "Task", "Improvement", or "Epic"

1. Invoke `superpowers:brainstorming`. Use the ticket description, parent context, and linked issues as starting context. Run the brainstorming flow to alignment on requirements and approach. The brainstorming skill will write a spec to `docs/superpowers/specs/`.
2. After the user approves the spec, invoke `superpowers:writing-plans` to draft an implementation plan in `docs/superpowers/plans/`.
3. Capture the plan file path as a "Plan path" reference.

The "Plan path" is appended to the engineer prompt in Step 4. The engineer will execute the plan via `superpowers:executing-plans`.

### If issuetype is "Sub-task"

If the parent ticket exists and is one of the types above, recurse on the parent's issuetype to choose the routing.
If the parent is also a Sub-task, unavailable, or has an unknown type, default to the Story branch (brainstorming + writing-plans).

### Routing output

After routing completes, the engineer prompt in Step 4 will include exactly one of:

- An `## Investigation primer` section (Bug path)
- A `## Plan path: <path-to-plan-file>` line (Story / Task / Improvement / Epic / Sub-task path)

Track the chosen routing as `ROUTING_TYPE = "bug" | "story"` for use in Step 4.

## Step 4: Invoke Engineer Agent

Use the `Agent` tool with `subagent_type: "engineer"`. The engineer agent handles domain routing internally via `domain-routing.md`. Pass this prompt (fill in all bracketed values):

```
You are handling Jira ticket [TICKET-ID].

## Ticket
- **Summary**: [summary]
- **Type**: [issuetype] | **Priority**: [priority] | **Status**: [status]
- **Labels**: [labels] | **Components**: [components]
- **Created**: [date] | **Last Updated**: [date] ([relative time])

## Description
[full description text]

## Context
- **Parent/Epic**: [EPIC-KEY: summary (status) — or "None"]
- **Linked Issues**: [list each as "- [type]: KEY — summary (status)" — or "None"]
- **Sub-tasks**: [list each as "- KEY: summary (status, priority)" — or "None"]
- **Attachments**: [downloaded paths, or "N available (not downloaded)", or "None"]

## Recent Comments
[last 5 comments, or "None"]

## Git Worktree
Branch `[BRANCH_NAME]` is checked out at `[WORKTREE_PATH]`.
ALL file edits, Bash commands, lint, and tests MUST use this path as the working directory.
The main checkout is OFF LIMITS — do not edit or run commands there.

[IF ROUTING_TYPE = "bug":]
## Investigation primer
[paste the Phase 1 systematic-debugging output here:
- Confirmed symptom
- Reproduction conditions
- 1–3 initial hypotheses ranked by likelihood]

Continue superpowers:systematic-debugging from Phase 2 (hypothesize and test). Do not restart the skill.

[ELIF ROUTING_TYPE = "story":]
## Plan path
[absolute path to the plan file written by writing-plans, e.g., docs/superpowers/plans/2026-05-07-foo-feature.md]

Execute this plan via superpowers:executing-plans. Do not re-brainstorm or re-plan.

[ENDIF]

## Instructions
1. Review parent/epic and linked issues for broader context
2. Analyze requirements; if attachments were downloaded, examine them
3. Explore the codebase to understand the current implementation
4. Implement following the routed skill (systematic-debugging or executing-plans). Pair every implementation phase with superpowers:test-driven-development.
5. Before reporting "done", invoke superpowers:verification-before-completion. Run actual verification commands and read their output before claiming pass.
6. When implementation is complete, stop. Do not draft or post any Jira comments. Do not push or create a PR.
```

(The bracketed `[IF ... ENDIF]` block is interpreted by the Claude session running /ticket — at template substitution time, only the relevant branch is emitted to the engineer.)

Track `PASS_NUMBER = 1` and `MAX_PASSES = 3`.

## Step 5: Programmatic Validation

Validation runs in the MAIN checkout, not the worktree, because the worktree lacks `node_modules`. Files are copied from the worktree → main checkout, validated, and the main checkout is restored to pristine on every exit path.

### 5a: Collect changed files (in worktree)

```bash
git -C [WORKTREE_PATH] diff --name-only master...HEAD
```

The three-dot syntax catches every file changed since the branch diverged from master, including changes the engineer already committed (engineer.md mandates TDD with frequent commits, so the worktree's working tree is typically clean by the time we reach Step 5).

Filter results to `.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.scss`. Store as `CHANGED_FILES` (paths relative to repo root).

If `CHANGED_FILES` is empty: skip 5b–5g, set `OVERALL_STATUS = "pass"`, proceed to Step 6.

### 5b: Identify co-located test files

For each file in `CHANGED_FILES`, look for co-located test files:
- `<dir>/<base>.test.{ts,tsx,js,jsx}`
- `<dir>/__tests__/<base>.test.{ts,tsx,js,jsx}`
- `.spec.*` variants of the above

Use `ls -1 <candidate> 2>/dev/null` to check existence. Add any that exist to `TEST_FILES`. The combined set `COPY_FILES = CHANGED_FILES ∪ TEST_FILES` is what gets copied.

### 5c: Copy files into main checkout

For each path in `COPY_FILES`:
```bash
mkdir -p "$(dirname <path-relative-to-repo-root>)"
cp [WORKTREE_PATH]/<path> ./<path>
```

The main checkout now has the engineer's changes for validation purposes only.

### 5d: Set up exit cleanup

Define a cleanup routine that ALWAYS runs after Step 5e–5g, on every code path (success, failure, abort). The routine:

```bash
git -C . checkout -- <COPY_FILES joined with spaces>
```

This restores the main checkout to pristine state. If `git checkout --` fails for any path because the file did not previously exist (i.e., the engineer created it new), the file will remain untracked — `git clean -f <path>` for each such path completes the cleanup.

Implement the cleanup as the FINAL action of Step 5 regardless of which branch is taken in 5h. Do NOT skip cleanup on validation failure.

### 5e: Lint (targeted, in main checkout)

```bash
./node_modules/.bin/eslint --cache <CHANGED_FILES joined with spaces>
```

- `LINT_STATUS = "pass"` if exit code 0, else `"fail"`
- Store full output as `LINT_OUTPUT`

### 5f: TypeScript typecheck (in main checkout)

```bash
pnpm typecheck 2>&1
```

- Filter output to lines referencing files in `CHANGED_FILES` only
- `TSC_STATUS = "pass"` if no matching error lines, else `"fail"`
- Store filtered lines as `TSC_OUTPUT`
- Pre-existing errors in unrelated files do not trigger failure

### 5g: Related unit tests (in main checkout)

If `TEST_FILES` is empty: `TESTS_STATUS = "skipped"`, inform user, continue.

Otherwise:
```bash
TZ=America/Phoenix pnpm unittest --testPathPattern="<basenames joined with |>"
```
- `TESTS_STATUS = "pass"` if exit code 0, else `"fail"`
- Store output as `TESTS_OUTPUT`

### 5h: Run cleanup, then evaluate

**RUN CLEANUP NOW** (per 5d) before evaluating results. Cleanup must complete regardless of pass/fail.

`OVERALL_STATUS = "pass"` if LINT_STATUS is pass AND TSC_STATUS is pass AND TESTS_STATUS is pass or skipped.

**If all pass:** Invoke `superpowers:verification-before-completion` to confirm the result is real. The skill enforces reading actual command output rather than asserting pass blindly. After the skill confirms, show a validation summary table (check name, status, files covered) and proceed to Step 6.

**If any fail:** Show which checks failed with key error excerpts (first 20 lines per failing check).

- If `PASS_NUMBER >= MAX_PASSES`:
  - `AskUserQuestion`: "Validation failed on 3 consecutive passes. How should I proceed?"
    - "Override and proceed" → go to Step 6
    - "Let me fix manually" → stop (do NOT remove worktree; user is taking over)
    - "Abort" → invoke `superpowers:finishing-a-development-branch` with the abort path, then stop
- Else:
  - `AskUserQuestion`: "Validation failed (pass [PASS_NUMBER]/3). What should I do?"
    - "Send back to engineer for re-work" → increment `PASS_NUMBER`, return to Step 4 with the following **re-work context block** appended to the original engineer prompt:
      ```
      ## Re-work Context (Pass [N] of 3)

      Your previous implementation failed automated validation.
      Do NOT re-analyze ticket requirements. Focus only on fixing the errors below.
      After fixing, stop — do not run validation yourself.

      ### Failing checks:
      [LINT_OUTPUT first 50 lines — if lint failed]
      [TSC_OUTPUT filtered errors — if tsc failed]
      [TESTS_OUTPUT first 80 lines — if tests failed]
      ```
    - "Override and proceed" → go to Step 6
    - "Let me fix manually" → stop

## Step 6: User Acceptance Gate

Use `AskUserQuestion`: "Validation passed. Did these changes resolve the ticket as expected?"

- **"Yes"** → proceed to Step 7
- **"No, needs more work"** → ask follow-up: "What additional changes are needed?" (free text input)
  - Re-invoke the engineer agent (Step 4) with the original ticket context plus an `## Additional Requirements` section at the end containing the user's feedback
  - There is no cap on user-driven passes — these are intentional
  - After the engineer completes, return to Step 5 (validation) → Step 6 (acceptance gate)

## Step 7: Preview and Create PR

### 7a: Pre-push code review

Invoke `superpowers:requesting-code-review` against the diff in the worktree:
```bash
git -C [WORKTREE_PATH] diff master...HEAD
```

Provide the diff and the ticket summary as the skill's input. Show any findings to the user.

If the skill flags blocking issues:
- `AskUserQuestion`: "Code review found [N] blocking issue(s). Send back to engineer?"
  - "Yes, re-work" → increment `PASS_NUMBER`, then return to Step 4 with the review feedback appended as `## Re-work Context (code review)`. This counts against the 3-pass cap shared with Step 5 validation; if `PASS_NUMBER > MAX_PASSES`, fall back to the same prompt as Step 5h's max-passes branch.
  - "No, proceed anyway" → continue to 7b
- If only non-blocking suggestions, show them and continue.

### 7b: Construct PR details

- **Title**: `[TICKET-ID]: [ticket summary trimmed to 60 chars]`  *(per the user's PR title format preference: ticket ID first with a colon)*
- **Body**:
  ```markdown
  ## Summary
  - Fixes [TICKET-ID]: [full ticket summary]
  - [one bullet per major changed file describing what changed]
  - [mention parent epic or linked tickets if relevant]

  ## Test Plan
  - [ ] [key acceptance criterion from ticket description]
  - [ ] Lint, typecheck, and unit tests pass (validated pre-PR via copy-back)

  Jira: https://domoinc.atlassian.net/browse/[TICKET-ID]
  ```

Use `AskUserQuestion`: "Ready to create PR. Proceed?"
- "Create PR as shown" → continue
- "I'll create it manually" → stop (do NOT remove worktree; user is taking over)

### 7c: Push and create PR (from inside the worktree)

If confirmed:
1. `git -C [WORKTREE_PATH] push -u origin [BRANCH_NAME]` — push the branch in a **separate Bash call**
2. `gh -C [WORKTREE_PATH] pr create --title "[TITLE]" --body "[BODY]"` — create the PR in a **separate Bash call** (do NOT combine with the push using `&&`)
3. Capture `PR_URL` from output
4. Inform user: "PR created: [PR_URL]"

After `gh pr create` succeeds, `post-pr-manager.sh`, `post-agent-qa.sh`, and `post-sensei.sh` fire automatically as PostToolUse hooks on the Bash tool. Their output appears as hook feedback. **Read that feedback and immediately invoke the `project-manager`, `qa-specialist`, and `sensei` agents as instructed.**

Invoke in order: `project-manager` first (Jira comment is time-sensitive), then `qa-specialist`, then `sensei`.

### 7d: Wrap up via finishing-a-development-branch

After all three post-PR agents complete, invoke `superpowers:finishing-a-development-branch`. The skill walks merge / additional-PR / cleanup options. For our flow, the expected terminal action is worktree cleanup. Confirm with the user, then run:

```bash
git worktree remove [WORKTREE_PATH]
```

The workflow is now done.
