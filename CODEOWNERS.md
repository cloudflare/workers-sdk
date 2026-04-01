# Code Ownership

This repository uses [Codeowners Plus](https://github.com/multimediallc/codeowners-plus) to enforce code ownership and review requirements. This replaces GitHub's native CODEOWNERS with more fine-grained control — specifically, the ability to require approval from **multiple teams** (AND rules) before a PR can merge.

## How It Works

### Overview

When a PR is opened, updated, or reviewed, the Codeowners Plus GitHub Action runs. It reads `.codeowners` and `codeowners.toml` from the **base branch** (not the PR), evaluates the ownership rules, and:

- Posts a PR comment listing which teams need to approve
- Requests reviews from those teams
- When all rules are satisfied, the `@workers-devprod` bot submits an **approval review**

The native GitHub `CODEOWNERS` file contains a single rule (`* @workers-devprod`) making the bot the sole required code owner. Branch protection requires code owner approval, so the bot's approval is the merge gate. The check itself always passes — it only provides visibility.

```
PR opened/updated/reviewed
        │
        ▼
┌──────────────────────────────────┐
│  Codeowners Plus GHA runs        │  Reads .codeowners + codeowners.toml
│  Evaluates AND/OR rules          │  from the BASE branch (not the PR)
│  Posts comment listing reviewers  │
│  Requests reviews from teams     │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  All rules satisfied?            │
│  YES → @workers-devprod approves │  Bot submits approval review
│  NO  → bot does NOT approve      │  Comment lists who still needs to approve
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Native GitHub CODEOWNERS        │  * @workers-devprod
│  Branch protection requires      │  Bot approval is the merge gate
│  bot approval to merge           │
│  ─ nice GitHub UI shows status ─ │
└──────────────────────────────────┘
```

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

**Note on `\*/**`patterns:** The`-shared`packages use`\*/**`instead of`**` so that root-level files (`CHANGELOG.md`, `package.json`) are excluded from AND rules. This allows the changeset release PR to be approved by the wrangler team alone. Source code in subdirectories still requires product team approval.

### `codeowners.toml` — Advanced Configuration

Located at the repo root. Controls enforcement behavior, ignored paths, and admin bypass.

Key settings:

| Setting                    | Purpose                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `ignore`                   | Directories excluded from ownership checks (e.g. `.changeset`, `fixtures`) |
| `detailed_reviewers`       | Show per-file owner breakdown in PR comments                               |
| `suppress_unowned_warning` | Don't warn about files with no owner                                       |
| `enforcement.approval`     | When `true`, the bot approves PRs that satisfy all rules                   |
| `enforcement.fail_check`   | When `true`, the GHA check fails if rules aren't satisfied                 |
| `admin_bypass.enabled`     | Allow admins to bypass by approving with "Codeowners Bypass" text          |

### `CODEOWNERS` — Native GitHub File

The native GitHub `CODEOWNERS` file contains a single rule:

```
* @workers-devprod
```

This exists only so that GitHub branch protection can gate merging on the bot's approval. **Do not add rules to this file** — all ownership logic lives in `.codeowners`.

### `.github/workflows/codeowners.yml` — GitHub Actions Workflow

A single workflow handles PR events (`pull_request_target`). When reviews are submitted or dismissed, the separate `rerun_codeowners.yml` workflow re-runs the check.

Using `pull_request_target` (not `pull_request`) ensures the workflow has access to secrets for **fork PRs**. The checkout is always the base branch, so PR authors cannot modify ownership rules.

## Common Scenarios

### PR touches only wrangler-team-owned code

Example: changes to `packages/create-cloudflare/` or `packages/vite-plugin-cloudflare/`.

Only `@cloudflare/wrangler` approval is required. Once satisfied, the bot approves.

### PR touches product-team-owned code

Example: changes to `packages/wrangler/src/d1/`.

**Both** `@cloudflare/wrangler` AND `@cloudflare/d1` must approve. Codeowners Plus will post a comment listing who still needs to approve and request reviews from both teams. The bot approves only when both teams have approved.

### PR touches multiple product areas

Example: changes to both `packages/wrangler/src/d1/` and `packages/wrangler/src/kv/`.

All three teams must approve: `@cloudflare/wrangler` + `@cloudflare/d1` + `@cloudflare/workers-kv`.

### Changeset release PR

The automated changeset release PR modifies `CHANGELOG.md` and `package.json` files across packages. These files are explicitly owned by `@cloudflare/wrangler` only (via `**/CHANGELOG.md` and `**/package.json` rules), and the `-shared` package AND rules use `*/**` patterns that exclude root-level files. This means only wrangler team approval is needed for releases.

### PR touches ignored paths only

Example: changes only in `.changeset/` or `fixtures/`.

No ownership checks apply. The bot approves automatically.

### Draft PRs

The workflow runs in **quiet mode** for draft PRs:

- No PR comments posted
- No review requests sent
- The check still runs for visibility

### Emergency bypass

Repository admins can bypass all requirements by submitting an **approval review** with the text "Codeowners Bypass" (case-insensitive). This creates an audit trail. The bot will then approve the PR regardless of missing approvals.

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

For standalone packages (like `packages/*-shared/`), use `*/**` instead of `**` to exclude root-level release files from AND rules:

```bash
# Product: <Name> (AND: requires wrangler + <team>)
# */** excludes root-level files (CHANGELOG.md, package.json) from AND rules
& packages/<name>-shared/*/** @cloudflare/<team>
```

**Teams ready to add** (have source paths but no ownership entries yet):
R2, Queues, AI, Hyperdrive, Vectorize, Pipelines, SSL/Secrets Store, WVPC.

## Stale Review Handling

Codeowners Plus uses **smart dismissal**: when new commits are pushed to a PR, it only dismisses an approval if the files owned by that reviewer were changed. This avoids the frustration of GitHub's all-or-nothing stale review dismissal.

For this to work, the branch protection setting **"Dismiss stale pull request approvals when new commits are pushed"** must be **disabled**. Codeowners Plus handles dismissal itself.

## Troubleshooting

### Rules not matching expected files

Rules in `.codeowners` are relative to the file's directory. Check that:

- The path uses `**` for recursive matching (plain `*.js` only matches in the root directory)
- The path doesn't have a leading `/` (leading slashes are ignored but can be confusing)
- The `&` prefix is present (without it, the rule sets the primary owner instead of adding an AND requirement)

### Bot not approving even though all reviews are in

- Check that `enforcement.approval = true` in `codeowners.toml`
- Check that the `CODEOWNERS_GITHUB_PAT` secret is a PAT owned by the `@workers-devprod` account
- Check that `@workers-devprod` has write access to the repository
- Check the workflow run logs for errors (verbose output is enabled)

### PR can't merge despite bot approval

Ensure "Require review from Code Owners" is enabled in branch protection settings for the `main` branch, and that `@workers-devprod` is listed in the native `CODEOWNERS` file.

## References

- [Codeowners Plus documentation](https://github.com/multimediallc/codeowners-plus)
- [Codeowners Plus action on GitHub Marketplace](https://github.com/marketplace/actions/codeowners-plus)
- [GitHub branch protection docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
