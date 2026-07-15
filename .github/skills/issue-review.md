---
name: github-issue-review
description: Triage a GitHub issue on cloudflare/workers-sdk. Assesses quality, identifies the component, checks for duplicates, and recommends next steps.
---

# GitHub Issue Triage Skill

This skill triages a GitHub issue to assess its quality, identify the affected component, and recommend next steps for the maintainers.

**Important:** This skill runs without bash or network access. All analysis is based on the pre-fetched issue data in `context.json`. Use only `read`, `glob`, `grep`, `edit`, and `write` tools.

## Input

Pre-fetched issue data at `data/<issue_number>/context.json` containing the full issue details from the GitHub API (title, body, comments, labels, author, dates).

## Triage Process

Perform the following steps in order. **Stop and skip to Output as soon as you have sufficient evidence for a recommendation.**

### Step 1: Load Issue Details

Read the pre-fetched `context.json` file using the `read` tool.

Extract and note:

- Title and description
- Issue type (bug report vs feature request vs question)
- Product/component affected
- Version reported against (if any)
- Operating system (if any)
- Reproduction steps or reproduction link (if any)
- Error messages (if any)
- Comment count and any relevant comment content
- Labels currently applied
- Issue age (created date) and last activity date
- `state_reason` if the issue is already closed

### Step 2: Check for Closeable Issues

Check each of the following categories in order. **STOP at the first match** and skip to Output.

> **Note:** The `state_reason` values in this section (`completed`, `not_planned`) are informational — they indicate the appropriate GitHub close reason for maintainer reference. They are not captured as a field in the output report.

#### 2a: Spam or Junk

Recommend **CLOSE** (state_reason: `not_planned`, no comment needed) if:

- The body contains random characters, test text, or nonsensical content (e.g. "bhhg", "ssssssssss", "aloll")
- The issue is clearly spam (e.g. loan advertisements, SEO spam, unrelated product promotions)
- The issue is a blank/empty test issue (e.g. title is "test" with no meaningful body)
- The body is entirely empty or contains only template headers with no content filled in

#### 2b: Reporter Confirmed Resolved

Recommend **CLOSE** (state_reason: `completed`) if:

- The reporter explicitly confirmed the issue is resolved in comments
- The reporter said they found a workaround and no longer need a fix
- A maintainer indicated it should be closed in comments

#### 2c: Already Fixed in a Prior Release

Recommend **CLOSE** (state_reason: `completed`) if, based on references within the issue comments or linked PRs:

- A comment references a PR or release that addresses this issue
- The issue describes a bug that was fixed in a version newer than the reporter's version
- The issue's symptoms match a fix described in a linked PR or comment

When closing, cite the specific PR number and release version if known.

**Template:**

> This issue has been fixed in PR #XXXX, which was released in **wrangler X.Y.Z** (or the relevant package version). Please update and let us know if you're still seeing the issue.

Or for older issues where the fix can't be pinpointed:

> This is a fairly old issue, and from testing with the latest version, it appears to have been resolved. I'm going to close it for now — if you're still running into problems on the latest version, feel free to open a new issue with more details and we can investigate further.

#### 2d: Duplicate

Recommend **CLOSE** (state_reason: `not_planned`) if a comment or linked reference in the issue identifies it as a duplicate of another issue — for example, a maintainer has already commented pointing to a canonical issue, or the reporter themselves links to an existing report.

When closing, link to the canonical issue.

**Template:**

> Closing as a duplicate of #XXXX. Please follow that issue for updates.

If the duplicate is in another repo:

> I'm closing this as a duplicate of <owner/repo>#XXXX, which is where this is being tracked.

#### 2e: Not workers-sdk / Wrong Repo

Recommend **CLOSE** (state_reason: `not_planned`) if:

- The issue describes Workers **runtime** behavior (fetch API quirks, V8 issues, compatibility flags, crypto APIs) — belongs in [cloudflare/workerd](https://github.com/cloudflare/workerd)
- The issue is about a third-party framework (Nuxt, SvelteKit, Remix, Hono, React Router) and the bug is in that framework's code, not in Wrangler or the Vite plugin
- The issue is about an upstream tool (esbuild, Bun, Vite core) rather than Cloudflare's integration
- The issue is an account/billing/abuse problem — belongs in Cloudflare Support

**Templates:**

For framework issues:

> It looks like this issue is coming from <framework>, rather than from workers-sdk. I'd recommend opening an issue on that project's repo: <link>. If it turns out to be a workers-sdk issue after all, feel free to open a new issue here with more details.

For runtime issues:

> This looks like a Workers runtime issue rather than a tooling issue. The right place to track this is [cloudflare/workerd](https://github.com/cloudflare/workerd) — could a maintainer transfer this issue there?

(Set Action field to: "Transfer to cloudflare/workerd, then post this comment.")

For account/support issues:

> Unfortunately, we're unable to provide support for account-level issues via GitHub. Please contact Cloudflare Support at https://dash.cloudflare.com/?to=/:account/support or the email address mentioned in the error message.

#### 2f: Stale / No Response

Recommend **CLOSE** (state_reason: `not_planned`) if:

- The issue has the `awaiting reporter response` or `needs reproduction` label AND the last activity was >30 days ago
- The issue is >12 months old with no activity in the last 6 months
- A maintainer asked for a reproduction or clarification and the reporter never responded

**Template:**

> We haven't heard from you in a while so I'm going to close this issue for now. If you're still running into problems, feel free to open a new issue with more details and we can investigate further.

For very old issues:

> This is a very old issue so I'm going to close it for now. If you're still running into problems on the latest version, feel free to comment with more details and we can investigate further.

#### 2g: Transient Platform Issue

Recommend **CLOSE** (state_reason: `completed`) if:

- The issue describes a one-time API error (500, 503, auth failures) that appears to have been a service incident
- Multiple users reported the same error around the same time, and it has since stopped
- The error is from Cloudflare's API (not from Wrangler itself) and there's no way to fix it in workers-sdk

**Template:**

> This was a transient API issue, and should be resolved now. If you're still seeing this error, please open a new issue with the latest details and we can investigate further.

Or for old transient issues:

> This appears to have been a transient server-side API issue. Similar reports were caused by Cloudflare API incidents that have since been resolved. I'm going to close this for now.

#### 2h: User Error / Misunderstanding

Recommend **CLOSE** (state_reason: `not_planned`) if:

- The issue describes expected behavior that the reporter misunderstands
- The issue is caused by incorrect configuration, wrong SQL syntax, or misuse of an API
- The fix is a documentation pointer rather than a code change

When closing, explain the correct approach and link to relevant documentation. Be helpful, not dismissive.

**Template:**

> This isn't a bug — <brief explanation of the correct behavior>. You can find more details in the docs: <link>. I'm going to close this for now, but feel free to ask on our [Discord](https://discord.cloudflare.com) if you have more questions.

#### 2i: Breaking Change

Recommend **KEEP OPEN** if:

- The requested change would be a breaking change in the current major version

The issue should remain open as a tracking item. Do not close it — the team hasn't decided against the change, it's deferred to a future major version.

**Suggested labels:** `breaking change`

**Template:**

> Changing this behavior at this stage would be a breaking change, so it will need to wait for the next major version. I've added the `breaking change` label to track this.

(Set Action field to: "Apply `breaking change` label, then post this comment.")

#### 2j: Won't Fix / By Design

Recommend **CLOSE** (state_reason: `not_planned`) if:

- The behavior is intentional and documented
- The team has explicitly decided not to implement this feature
- The cost/complexity of the change outweighs the benefit

**Templates:**

For design decisions:

> This is intentional behavior — <brief explanation>. I don't think we're likely to change this in the near future, but we appreciate the feedback.

For feature requests that won't happen:

> Thanks for the suggestion. We don't intend to implement this right now, but it may be revisited in future. <Optional: brief explanation of why, or pointer to an alternative approach.>

#### 2k: Feature Superseded / Deprecated

Recommend **CLOSE** (state_reason: `completed`) if:

- The requested feature has been implemented via a different mechanism than proposed
- The issue relates to a deprecated feature that has a replacement
- A newer feature or package addresses the underlying need

**Template:**

> This has been addressed by <feature/package>. <Brief explanation of how it solves the original request.> I'm going to close this for now.

### Step 3: Check for Insufficient Information

If the issue wasn't caught by Step 2, recommend **NEEDS MORE INFO** if:

- Bug report has no reproduction steps or link (the bug template requires one)
- Bug report is missing version information
- The description is too vague to act on (e.g. "it doesn't work" with no details)
- The error message is missing or truncated

**Template:**

> Thanks for reporting this. Could you provide <specific missing information>? In particular:
>
> - <specific question 1>
> - <specific question 2>
>
> A minimal reproduction (a GitHub repo or link we can clone and run) would also help us investigate. Without more details, we won't be able to look into this.

**Suggested label:** `awaiting reporter response` (and optionally `needs reproduction`)

**STOP HERE if** the issue clearly needs more info. Skip to Output.

### Step 4: Identify Component

Map the issue to a package based on labels, title, and body content:

| Signal                                                                   | Package                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------- |
| `wrangler` label, wrangler CLI commands, `wrangler.toml`/`wrangler.json` | `packages/wrangler`                             |
| `miniflare` label, local dev simulation                                  | `packages/miniflare`                            |
| `d1` label, D1 database, `d1 execute`, migrations                        | `packages/wrangler` (D1 code is in wrangler)    |
| `vitest` label, worker tests, `vitest-pool-workers`                      | `packages/vitest-pool-workers`                  |
| `vite-plugin` label, vite dev, `@cloudflare/vite-plugin`                 | `packages/vite-plugin-cloudflare`               |
| `c3` label, `create-cloudflare`, project scaffolding                     | `packages/create-cloudflare`                    |
| `pages` label, Pages deployment, `_routes.json`, `_headers`              | `packages/wrangler` (Pages code is in wrangler) |
| `Workers + Assets` label, static asset serving                           | `packages/wrangler`                             |
| `containers` label, container registry                                   | `packages/wrangler`                             |
| `workflows` label, Workflows API                                         | `packages/wrangler`                             |
| `workers-builds` label                                                   | Workers Builds (may be internal)                |
| `python` label, Python Workers                                           | `packages/wrangler`                             |
| `workers for platforms` label, dispatch namespaces                       | `packages/wrangler`                             |
| `kv-asset-handler` label                                                 | `packages/kv-asset-handler`                     |
| `types` label, `wrangler types` command                                  | `packages/wrangler`                             |
| R2, KV, Queues, Durable Objects, Vectorize bindings                      | `packages/wrangler`                             |
| `node compat`/`nodejs compat` label, Node.js APIs                        | May be workerd or wrangler depending on context |
| Workers runtime behavior (not tooling)                                   | Likely belongs in cloudflare/workerd            |
| Cloudflare dashboard, API behavior                                       | Likely a platform issue, not workers-sdk        |

### Step 5: Assess Reproducibility and Severity

For **bug reports**, evaluate:

- **Has reproduction?** Does the issue include a minimal repro link or clear steps?
- **Severity estimate:** Is this a crash, data loss, incorrect behavior, or cosmetic issue?
- **Scope:** Does it affect all users or a specific configuration?
- **Workaround available?** Did the reporter or comments mention one?
- **Version gap:** Is the reporter on an old version? Could updating fix this?

For **feature requests**, evaluate:

- **Clarity:** Is the proposed solution clearly described?
- **Use case:** Is the motivation explained?
- **Scope:** Small enhancement vs large new feature?
- **Existing alternatives:** Is there already a way to achieve this (even if less convenient)?

## Output Format

**How the output is used:** `report.md` is posted verbatim as a maintainer-facing triage comment on the issue (attributed to an automated bot), and the labels in `summary.json` are applied automatically. Because of this:

- Write `report.md` for maintainers, not the reporter. The **Suggested Comment** section is a _draft_ for a maintainer to send to the reporter — it is **not** posted automatically, so do not phrase the surrounding report as though a reply has already been made.
- Only put labels in the **Suggested Labels** fields that already exist in the repository. If unsure whether a label exists, omit it rather than guess — non-existent labels are dropped before applying, so inventing labels only weakens the report's accuracy.

### Report Directory Structure

```
./data/<issue_number>/
├── report.md          # Full detailed report
└── summary.json       # Structured JSON summary
```

### Output Step 1: Write Full Report

Write the full report to `./data/<issue_number>/report.md`:

```markdown
# Issue Triage: <owner/repo>#<number>

## Summary

<One-line summary of the issue>

## Classification

- **Type:** <Bug | Feature Request | Question | Discussion>
- **Component:** <package name or "unknown">
- **Severity:** <Critical | High | Medium | Low | N/A>
- **Has Reproduction:** <Yes (with link) | No | N/A>
- **Quality:** <Complete | Partial | Incomplete>

## Findings

- **Created:** <date>
- **Author:** <username>
- **Version:** <reported version, or "not specified">
- **Labels:** <labels, or "none">
- **Comments:** <count>

### Analysis

<2-5 bullet points covering what you found — component identification,
reproducibility assessment, severity reasoning, staleness indicators,
duplicate candidates. Only include what's relevant.>

## Recommendation

**Status:** <CLOSE | KEEP OPEN | NEEDS MORE INFO | NEEDS VERIFICATION>

**Reasoning:** <2-3 sentences explaining why>

**Action:** <What a maintainer should do next>

**Suggested Labels:** <labels to add, if any. Use existing repo labels only.>

### Suggested Comment

> <The exact comment to post on the issue. Follow the templates above for the
> matching closure category. Key principles:
>
> - Always offer an escape hatch ("feel free to open a new issue")
> - Link to specific PRs, releases, or docs when available
> - Be concise for straightforward closures, detailed for design decisions
> - Never be dismissive or snarky, even for spam (just close silently) or user error
> - For NEEDS MORE INFO, ask specific questions (not generic "please provide more details")
>   Omit this section entirely for spam (close without comment) or if no comment is needed.>
```

### Output Step 2: Write Summary File

Write a machine-readable summary as **JSON** to `./data/<issue_number>/summary.json`. This file is parsed by the triage workflow (to build the dashboard payload and apply labels), so it must be valid JSON with exactly these keys:

```json
{
  "issueNumber": <issue_number as a number>,
  "title": "<issue title, with emoji/template prefixes like 'Bug:' removed>",
  "githubUrl": "https://github.com/<owner>/<repo>/issues/<issue_number>",
  "recommendation": "<CLOSE | KEEP OPEN | NEEDS MORE INFO | NEEDS VERIFICATION>",
  "difficulty": "<easy | medium | hard | n/a>",
  "reasoning": "<brief reasoning, 1-2 sentences>",
  "suggestedAction": "<brief description of next steps>",
  "hasSuggestedComment": <true if a Suggested Comment section is present in the report, false otherwise>,
  "suggestedLabels": ["<label>", "..."]
}
```

**Key definitions:**

- **issueNumber**: The issue number as a JSON number (not a string).
- **title**: Issue title with any emoji prefixes (e.g. "🐛 Bug:") or template prefixes removed.
- **githubUrl**: Full URL to the issue.
- **recommendation**: One of `CLOSE`, `KEEP OPEN`, `NEEDS MORE INFO`, `NEEDS VERIFICATION`.
- **difficulty**: Estimated fix difficulty — `easy`, `medium`, `hard`, or `n/a` (for feature requests or closures).
- **reasoning**: Brief summary of why (1-2 sentences).
- **suggestedAction**: Brief description of next steps.
- **hasSuggestedComment**: Boolean — `true` if the report includes a Suggested Comment, `false` otherwise.
- **suggestedLabels**: JSON array of labels to apply, matching the **Suggested Labels** field in the report. Use existing repo labels only (see above). Use an empty array `[]` if there are no labels to apply.

**CRITICAL:** Write valid, parseable JSON only (no trailing commas, no comments, no surrounding markdown fences). Because JSON strings are escaped, `reasoning`/`suggestedAction` may safely contain any punctuation.
