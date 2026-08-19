---
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Add pull request metadata to `wrangler preview` deployments

`wrangler preview` now detects the pull request associated with the current CI run (GitHub Actions, GitLab CI, CircleCI, and a generic `PULL_REQUEST_URL`/`PR_URL`/`CHANGE_URL` fallback) and attaches it, along with the repository URL, to the preview deployment as annotations (`workers/pull_request_number`, `workers/pull_request_url`, `workers/repository_url`).

This is best effort: if no pull request can be detected, nothing changes. When a pull request is detected, its URL is now also shown in the `wrangler preview` command output.
