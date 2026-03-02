# Security Review: `multimediallc/codeowners-plus`

**Date:** 2026-03-02
**Reviewed version:** [v1.9.0](https://github.com/multimediallc/codeowners-plus/releases/tag/v1.9.0) (commit `ff02aa993a92e8efe01642916d0877beb9439e9f`)
**Context:** Evaluating for use as a GitHub Action in `cloudflare/workers-sdk` with access to a dedicated PAT (`READ_ONLY_ORG_GITHUB_TOKEN`).

## Overall Verdict

**LOW-MEDIUM risk — acceptable for use with the dedicated read-only org token.**

The codebase is well-structured with one critical security design decision done right: config and ownership rules are always read from the base branch, not the PR branch. There is no data exfiltration, no shell injection, and no token leakage. The main risks are inherent to the action's purpose (it has PR write access) and a few defense-in-depth gaps.

## Architecture

The action is a statically compiled Go binary running in an Alpine Docker container. It:

1. Reads `.codeowners` and `codeowners.toml` from the base branch (via `git show <base-sha>:<path>`)
2. Computes the PR diff (via `git diff <base-sha>...<head-sha>`)
3. Resolves team memberships via the GitHub API
4. Checks existing PR reviews against ownership rules
5. Posts comments, requests reviews, and optionally dismisses stale approvals

## Token Exposure Analysis

| Concern                                | Finding                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Token logged to stdout/stderr          | **No**                                                                                                |
| Token written to files                 | **No**                                                                                                |
| Token passed to subprocesses           | **No** — `git` commands don't receive the token                                                       |
| Token in PR comments or action outputs | **No**                                                                                                |
| Token sent to non-GitHub endpoints     | **No** — all HTTP goes through `go-github` to `api.github.com` only                                   |
| Token in process arguments             | **Low risk** — token is read from `INPUT_GITHUB-TOKEN` env var (standard GHA mechanism), not CLI args |

## API Calls Made With the Token

All HTTP requests use the `go-github` SDK, which sends requests exclusively to `https://api.github.com`. There are no outbound network calls to any non-GitHub endpoint.

| Method | Endpoint                                                   | Purpose                                            | Read/Write |
| ------ | ---------------------------------------------------------- | -------------------------------------------------- | ---------- |
| GET    | `/repos/{owner}/{repo}/pulls/{pr}`                         | Fetch PR metadata                                  | READ       |
| GET    | `/user`                                                    | Identify token owner                               | READ       |
| GET    | `/orgs/{org}/teams/{team}/members`                         | Resolve team memberships                           | READ       |
| GET    | `/repos/{owner}/{repo}/pulls/{pr}/reviews`                 | Fetch review state                                 | READ       |
| GET    | `/repos/{owner}/{repo}/issues/{pr}/comments`               | Check existing comments                            | READ       |
| GET    | `/repos/{owner}/{repo}/collaborators/{user}/permission`    | Check admin status (for bypass)                    | READ       |
| POST   | `/repos/{owner}/{repo}/issues/{pr}/comments`               | Post review status comment                         | **WRITE**  |
| PATCH  | `/repos/{owner}/{repo}/issues/comments/{id}`               | Update existing comment                            | **WRITE**  |
| POST   | `/repos/{owner}/{repo}/pulls/{pr}/requested_reviewers`     | Request reviews from teams                         | **WRITE**  |
| PUT    | `/repos/{owner}/{repo}/pulls/{pr}/reviews/{id}/dismissals` | Dismiss stale approvals                            | **WRITE**  |
| POST   | `/repos/{owner}/{repo}/pulls/{pr}/reviews`                 | Approve PR (only if `enforcement.approval = true`) | **WRITE**  |

Since `enforcement.approval` is not enabled in our config, the `ApprovePR` endpoint is **never called**.

## Security Findings

### No Issues Found

1. **No data exfiltration** — All HTTP traffic goes to `api.github.com` via `go-github`. No custom HTTP clients, no webhook calls, no external logging services.
2. **No shell injection** — All subprocess calls use `exec.Command("git", args...)` (argv-style, no shell invocation). Arguments are passed as separate array elements.
3. **No token leakage** — The token is never logged, written to files, included in PR comments, or passed to subprocesses.
4. **Base-branch config** — `.codeowners` and `codeowners.toml` are read from the base branch SHA (`git show <base-sha>:<path>`), preventing PR authors from modifying ownership rules.
5. **No PR code execution** — The action reads config files and computes diffs. It never checks out, compiles, or executes code from the PR branch.

### Medium Severity

**M1: Admin bypass uses permissive substring matching**

The admin bypass feature (enabled in our config) triggers when any review body contains the text "codeowners bypass" (case-insensitive). This is a **substring match**, meaning a comment like "I don't think we should use codeowners bypass here" would trigger the bypass check. The bypass is properly gated behind an admin/allowed-user check, but the trigger condition is broader than expected.

- **File:** `internal/github/gh.go`, `ContainsValidBypassApproval()`
- **Impact:** Accidental bypass trigger if an admin discusses the bypass feature in a review comment.
- **Mitigation:** The bypass still requires the commenter to be a repo admin or in the `allowed_users` list.

**M2: Smart review dismissal is a powerful write operation**

The action can dismiss existing PR approvals when it detects that files owned by a reviewer changed since their last approval. A bug in the stale-detection logic could incorrectly dismiss legitimate approvals.

- **File:** `internal/github/gh.go`, `DismissStaleReviews()`
- **Impact:** Legitimate approvals could be dismissed, requiring re-review.
- **Mitigation:** Can be disabled with `disable_smart_dismissal = true` in `codeowners.toml`.

**M3: Git ref values not validated as SHA format**

Ref values from the GitHub API (`PR.Base.GetSHA()`, `PR.Head.GetSHA()`) are passed to `git show`, `git diff`, and `git cat-file` without validating they match `^[0-9a-f]{40}$`. Since `exec.Command` is used (no shell), this isn't exploitable via shell injection, but a defense-in-depth gap exists if the GitHub API ever returned unexpected values.

- **Files:** `internal/git/file_reader.go:30`, `internal/git/diff.go:183`
- **Impact:** Theoretical — would require GitHub API to return malformed data.
- **Mitigation:** `exec.Command` prevents shell interpretation; git itself validates refs.

**M4: `GITHUB_OUTPUT` heredoc uses static delimiter**

The action writes to `GITHUB_OUTPUT` using a static `EOF` delimiter. If the JSON output contained a literal `\nEOF\n`, it could inject additional output variables. In practice, `json.Marshal` escapes newlines, making this unexploitable.

- **File:** `main.go:113`
- **Impact:** Theoretical only.

**M5: Path normalization does not reject `..` components**

The `normalizePathForGit()` function strips the repo directory prefix but does not reject paths containing `..`. Since the `GitRefFileReader` reads from the git object store (not the filesystem), and git trees don't contain `..` entries, this is mitigated.

- **File:** `internal/git/file_reader.go:48-58`
- **Impact:** Defense-in-depth gap; not exploitable via `git show`.

### Low Severity

**L1: `defer` inside loop in `DismissStaleReviews`** — Response bodies are deferred-closed inside a `for` loop, meaning they all remain open until the function returns. Resource leak under high load, not a security issue.

**L2: No rate limiting** — No handling of GitHub API rate limits or retries. Could cause action failures during high-activity periods.

**L3: `FilesystemReader` has no path restrictions** — The `FilesystemReader` (used only in tests, not in the GHA production path) wraps `os.ReadFile` with no path validation. Not a risk in production since `GitRefFileReader` is always used.

**L4: Error messages could theoretically contain sensitive data** — Error messages from the GitHub API are propagated to stderr. The `go-github` library generally sanitizes tokens from errors, but this is not verified.

## Features Not Used (No Risk)

These features are disabled in our `codeowners.toml` and pose no risk:

| Feature                         | Setting         | Risk if enabled                                                                                          |
| ------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| `enforcement.approval`          | Not set (false) | Would auto-approve PRs using the token identity                                                          |
| `require_both_branch_reviewers` | `false`         | Would read `.codeowners` from the PR branch (head ref), allowing PR authors to influence ownership rules |
| `allow_self_approval`           | `false`         | Would auto-satisfy reviewer groups containing the PR author                                              |

## Dependencies (Supply Chain)

Small dependency footprint — 6 direct, 6 indirect, 30 lines in `go.sum`:

| Dependency              | Purpose               | Risk                                      |
| ----------------------- | --------------------- | ----------------------------------------- |
| `google/go-github/v63`  | GitHub API client     | Low — Google-maintained, widely used      |
| `bmatcuk/doublestar/v4` | Glob pattern matching | Low — focused library                     |
| `pelletier/go-toml/v2`  | TOML config parsing   | Low — data-only format, no code execution |
| `sourcegraph/go-diff`   | Unified diff parsing  | Low — Sourcegraph-maintained              |
| `boyter/gocodewalker`   | File tree walking     | Low — only used in CLI tool, not the GHA  |
| `urfave/cli/v2`         | CLI framework         | Low — only used in CLI tool, not the GHA  |

## Docker Image

- Multi-stage build: Go 1.23 builder → Alpine runtime
- Only `git` is installed in the runtime image
- Compiled binary is a static Go binary (`CGO_ENABLED=0`)
- Entrypoint: `git config --global --add safe.directory /github/workspace` → `git branch` → `/codeowners`

## Blast Radius if Compromised

If the action were compromised via a supply-chain attack, the attacker would have access to `READ_ONLY_ORG_GITHUB_TOKEN` and could:

**Could do:**

- Read org team memberships (enumerate `@cloudflare/*` team members)
- Post/edit comments on the triggering PR
- Request/dismiss reviews on the triggering PR
- Read repository contents accessible with the token

**Could NOT do:**

- Push code to the repository
- Merge PRs
- Access other repository secrets
- Approve PRs (since `enforcement.approval` is disabled)
- Access secrets from other workflows

The blast radius is limited by using a dedicated minimal-permission token rather than the broad `GH_ACCESS_TOKEN`.

## Token Permissions Required

The `READ_ONLY_ORG_GITHUB_TOKEN` needs the following permissions:

- **Organization:** `members: read` — to resolve `@cloudflare/*` team memberships
- **Repository:** `pull-requests: write` — for review requests and dismissals
- **Repository:** `issues: write` — for PR comments (GitHub treats PR comments as issue comments)
- **Repository:** `contents: read` — for checkout (provided by the workflow's `permissions` block)

Note: Despite the token name suggesting "read only", the action requires write access to pull requests and issues for its core functionality (posting comments, requesting reviewers, dismissing stale reviews).

## Recommendations

1. **Proceed with integration** — The code is sound and the dedicated token limits blast radius.
2. **Keep the action pinned to commit SHA** — Already done (`ff02aa993a92e8efe01642916d0877beb9439e9f`).
3. **Monitor admin bypass** — Be aware that "codeowners bypass" is a magic substring in review comments. Consider disabling `admin_bypass` if not needed.
4. **Monitor smart dismissal** — Watch for unexpected review dismissals during Phase 1. Can be disabled if problematic.
5. **Verify token permissions** — Ensure the token has PR write and issue write permissions, not just org read.
6. **Re-review on version updates** — When updating the pinned SHA, review the diff between versions for new API calls or behavioral changes.
