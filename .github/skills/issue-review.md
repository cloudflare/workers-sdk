---
name: github-issue-review
description: Triage a GitHub issue on cloudflare/workers-sdk. Assesses quality, identifies the component, checks for duplicates, and recommends next steps.
---

# GitHub Issue Triage Skill

This skill triages a GitHub issue to assess its quality, identify the affected component, check for duplicates or existing fixes, and recommend next steps for the maintainers.

It handles both **new issues** (quality assessment, routing, repro check) and **older issues** (staleness check, changelog search).

## Input

The skill expects either:

- A GitHub issue URL (e.g., `https://github.com/cloudflare/workers-sdk/issues/123`)
- A repository and issue number (e.g., `cloudflare/workers-sdk#4948`)
- Pre-fetched issue data in `data/<issue_number>/context.json`

## Triage Process

Perform the following steps in order. **Stop and skip to Output as soon as you have sufficient evidence for a recommendation.**

### Step 1: Load Issue Details

If a `context.json` file has been pre-fetched, read it. Otherwise:

```bash
gh issue view <number> --repo <owner/repo> --json number,title,body,comments,createdAt,updatedAt,labels,state,closedAt,author
```

Extract and note:

- Title and description
- Issue type (bug report vs feature request vs question)
- Product/component affected
- Version reported against (if any)
- Operating system (if any)
- Reproduction steps or reproduction link (if any)
- Error messages (if any)
- Comment count

### Step 2: Check for Empty or Invalid Issues

Recommend **CLOSE** if:

- The body is empty or contains only template headers with no content filled in
- The issue is clearly spam or off-topic (not related to workers-sdk)
- The reporter confirmed the issue is resolved (in comments)
- A maintainer indicated it should be closed (in comments)

Recommend **NEEDS MORE INFO** if:

- Bug report has no reproduction steps or link (the template requires one)
- Bug report is missing version information
- The description is too vague to act on

**STOP HERE if** the issue is clearly closeable or clearly needs more info. Skip to Output.

### Step 3: Identify Component

Map the issue to a package based on labels, title, and body content:

| Signal                                                   | Package                                         |
| -------------------------------------------------------- | ----------------------------------------------- |
| `wrangler` label, wrangler CLI commands, `wrangler.toml` | `packages/wrangler`                             |
| `miniflare` label, local dev simulation                  | `packages/miniflare`                            |
| `d1` label, D1 database                                  | `packages/wrangler` (D1 code is in wrangler)    |
| `vitest` label, worker tests                             | `packages/vitest-pool-workers`                  |
| `vite-plugin` label, vite dev                            | `packages/vite-plugin-cloudflare`               |
| `c3` label, `create-cloudflare`, project scaffolding     | `packages/create-cloudflare`                    |
| `pages` label, Pages deployment                          | `packages/wrangler` (Pages code is in wrangler) |
| R2, KV, Queues, Durable Objects bindings                 | `packages/wrangler`                             |
| Workers runtime behavior (not tooling)                   | May be a platform issue, not workers-sdk        |

If the issue describes Workers **runtime** behavior (e.g., fetch API quirks, V8 issues, compatibility flags) rather than **tooling** behavior, note that it may belong in a different repo.

### Step 4: Check for Duplicates and Existing Fixes

Search for related issues and PRs:

```bash
# Search open issues with related keywords (1-2 key terms from the title)
gh issue list --repo <owner/repo> --state open --search "<keyword>" --limit 10 --json number,title,createdAt

# Search for PRs mentioning the issue number or related keywords
gh pr list --repo <owner/repo> --state merged --search "<keyword>" --limit 10 --json number,title,mergedAt
```

If a merged PR explicitly fixes this issue or a near-identical open issue exists, note it.

**STOP HERE if** a merged PR explicitly fixes this, or the issue is a clear duplicate. Skip to Output.

### Step 5: Assess Reproducibility and Severity

For **bug reports**, evaluate:

- **Has reproduction?** Does the issue include a minimal repro link or clear steps?
- **Severity estimate:** Is this a crash, data loss, incorrect behavior, or cosmetic issue?
- **Scope:** Does it affect all users or a specific configuration?
- **Workaround available?** Did the reporter or comments mention one?

For **feature requests**, evaluate:

- **Clarity:** Is the proposed solution clearly described?
- **Use case:** Is the motivation explained?
- **Scope:** Small enhancement vs large new feature?

### Step 6: Check Changelogs (for older issues only)

**Skip this step if the issue was created within the last 30 days.**

For older issues, check if the problem was already fixed in a newer release:

```bash
# Search changelog for issue number
gh api repos/cloudflare/workers-sdk/contents/packages/<package>/CHANGELOG.md \
  -H "Accept: application/vnd.github.raw" 2>/dev/null | grep -n "#<issue_number>" | head -5
```

If found, fetch surrounding context to confirm. If the issue is 6+ months old with no activity, note the staleness.

## Output Format

### Report Directory Structure

```
./data/<issue_number>/
├── report.md          # Full detailed report
└── summary.md         # Single-line tab-separated summary
```

### Output Step 1: Create Report Directory

```bash
mkdir -p ./data/<issue_number>
```

### Output Step 2: Write Full Report

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

<2-5 bullet points covering what you found — component identification, duplicate check results,
reproducibility assessment, severity reasoning. Only include what's relevant.>

## Recommendation

**Status:** <CLOSE | KEEP OPEN | NEEDS MORE INFO | NEEDS VERIFICATION | DUPLICATE>

**Reasoning:** <2-3 sentences explaining why>

**Action:** <What a maintainer should do next>

**Suggested Labels:** <labels to add, if any>

### Suggested Comment

> <The exact comment to post on the issue, if applicable. For NEEDS MORE INFO,
> ask specific questions. For DUPLICATE, link the original. For CLOSE, explain why.
> Omit this section if no comment is needed.>
```

### Output Step 3: Write Summary File

Write a single tab-separated line to `./data/<issue_number>/summary.md` with these 7 fields:

```
[<issue_number>](https://github.com/<owner>/<repo>/issues/<issue_number>)	<title>	<CLOSE|KEEP OPEN|NEEDS MORE INFO|NEEDS VERIFICATION|DUPLICATE>	<easy|medium|hard|n/a>	<brief reasoning>	<brief suggested action>	<Yes|No|N/A>
```

**Column definitions:**

- **Issue #**: Link to the issue in markdown format `[number](url)`
- **Title**: Issue title (remove any emoji prefixes like "Bug:")
- **Recommendation**: One of CLOSE, KEEP OPEN, NEEDS MORE INFO, NEEDS VERIFICATION, DUPLICATE
- **Difficulty**: Estimated fix difficulty - `easy`, `medium`, `hard`, or `n/a` (for feature requests or closures)
- **Reasoning**: Brief summary of why (1-2 sentences)
- **Suggested Action**: Brief description of next steps
- **Suggested Comment**: "Yes" if a comment template is provided, "No" or "N/A" otherwise

**CRITICAL:** Use actual tab characters (`\t`) as column delimiters. Write only the single data line, no header.
