# Code Ownership

This repository uses [Codeowners Plus](https://github.com/multimediallc/codeowners-plus) to enforce code ownership and review requirements. This replaces GitHub's native CODEOWNERS with more fine-grained control — specifically, the ability to require approval from **multiple teams** (AND rules) before a PR can merge.

## How It Works

### Overview

When a PR is opened, updated, or reviewed, the Codeowners Plus GitHub Action runs. It reads `.codeowners` and `codeowners.toml` from the **base branch** (not the PR), evaluates the ownership rules, and:

- Posts a PR comment listing which teams need to approve
- Requests reviews from those teams
- Sets a **required status check** ("Run Codeowners Plus") that passes only when all ownership rules are satisfied

The native GitHub `CODEOWNERS` file is not involved in enforcement.

### Key Difference from Native CODEOWNERS

| Feature                  | Native GitHub CODEOWNERS          | Codeowners Plus                                                                 |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------------------- |
| Multiple teams on a path | **OR** — any one team can approve | **AND** via `&` prefix — all listed teams must approve                          |
| Path matching for `*.js` | Matches anywhere in repo          | Matches only in the `.codeowners` file's directory; use `**/*.js` for recursive |
| Per-directory config     | Single file only                  | `.codeowners` file in any directory (rules are relative to that directory)      |
| Stale review dismissal   | All-or-nothing                    | Smart — only dismisses when reviewer's owned files change                       |
| Optional reviewers       | Not supported                     | `?` prefix — CC without blocking                                                |

## Configuration Files

### `.codeowners` — Ownership Rules

Located at the repo root. Defines who owns what using path patterns and team handles. See the comments in the file itself for syntax details and a template for adding new product teams.

### `codeowners.toml` — Advanced Configuration

Located at the repo root. Controls enforcement behavior, ignored paths, and admin bypass.

Key settings:

| Setting                    | Purpose                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `ignore`                   | Directories excluded from ownership checks (e.g. `.changeset`, `fixtures`) |
| `detailed_reviewers`       | Show per-file owner breakdown in PR comments                               |
| `suppress_unowned_warning` | Don't warn about files with no owner                                       |
| `enforcement.fail_check`   | When `true`, the GHA check fails if rules aren't satisfied                 |
| `admin_bypass.enabled`     | Allow admins to bypass by approving with "Codeowners Bypass" text          |

### `CODEOWNERS` — Native GitHub File

The native GitHub `CODEOWNERS` file is kept for reference but is **not the enforcement mechanism**. Enforcement is handled by the Codeowners Plus required status check. All ownership logic lives in `.codeowners`.

### `.github/workflows/codeowners.yml` — GitHub Actions Workflow

A single workflow handles all events:

- `pull_request_target` — PR opened, updated, marked ready, labeled
- `pull_request_review` — review submitted or dismissed

Using `pull_request_target` (not `pull_request`) ensures the workflow has access to secrets for **fork PRs**. The checkout is always the base branch, so PR authors cannot modify ownership rules.

## Common Scenarios

### PR touches only wrangler-team-owned code

Example: changes to `packages/create-cloudflare/` or `packages/vite-plugin-cloudflare/`.

Only `@cloudflare/wrangler` approval is required.

### PR touches product-team-owned code

Example: changes to `packages/wrangler/src/d1/`.

**Both** `@cloudflare/wrangler` AND `@cloudflare/d1` must approve. Codeowners Plus will post a comment listing who still needs to approve and request reviews from both teams.

### PR touches multiple product areas

Example: changes to both `packages/wrangler/src/d1/` and `packages/wrangler/src/kv/`.

All three teams must approve: `@cloudflare/wrangler` + `@cloudflare/d1` + `@cloudflare/workers-kv`.

### PR touches ignored paths only

Example: changes only in `.changeset/` or `fixtures/`.

No ownership checks apply. The codeowners-plus check passes automatically.

### Draft PRs

The workflow runs in **quiet mode** for draft PRs:

- No PR comments posted
- No review requests sent
- The status check still runs for visibility

### Emergency bypass

Repository admins can bypass all requirements by submitting an **approval review** with the text "Codeowners Bypass" (case-insensitive). This creates an audit trail.

### Fork PRs

Fork PRs are fully supported. The workflow uses `pull_request_target` to run in the base repo context with access to secrets. The base branch is checked out (so ownership rules come from the protected branch), and the PR head is fetched as git objects only for diff computation. No fork code is executed.

## Adding a New Product Team

To add ownership for a new product team, add AND rules to `.codeowners`:

```bash
# Product: <Name> (AND: requires wrangler + <team>)
& packages/wrangler/src/<feature>/** @cloudflare/<team>
& packages/wrangler/src/__tests__/<feature>/** @cloudflare/<team>
& packages/miniflare/src/plugins/<feature>/** @cloudflare/<team>
& packages/miniflare/src/workers/<feature>/** @cloudflare/<team>
& packages/miniflare/test/plugins/<feature>/** @cloudflare/<team>
```

For example, to add R2 ownership:

```bash
# Product: R2 (AND: requires wrangler + r2)
& packages/wrangler/src/r2/** @cloudflare/r2
& packages/wrangler/src/__tests__/r2/** @cloudflare/r2
& packages/miniflare/src/plugins/r2/** @cloudflare/r2
& packages/miniflare/src/workers/r2/** @cloudflare/r2
& packages/miniflare/test/plugins/r2/** @cloudflare/r2
```

**Teams ready to add** (have source paths but no ownership entries yet):
R2, Queues, AI, Hyperdrive, Vectorize, Pipelines, SSL/Secrets Store, WVPC.

## Stale Review Handling

Codeowners Plus uses **smart dismissal**: when new commits are pushed to a PR, it only dismisses an approval if the files owned by that reviewer were changed. This avoids the frustration of GitHub's all-or-nothing stale review dismissal.

For this to work, the branch protection setting **"Dismiss stale pull request approvals when new commits are pushed"** must be **disabled**. Codeowners Plus handles dismissal itself.

## References

- [Codeowners Plus documentation](https://github.com/multimediallc/codeowners-plus)
- [Codeowners Plus action on GitHub Marketplace](https://github.com/marketplace/actions/codeowners-plus)
- [GitHub branch protection docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
