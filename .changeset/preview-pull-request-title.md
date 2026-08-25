---
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Add pull request title to `wrangler preview` deployment annotations

`wrangler preview` now also detects the title of the pull/merge request associated with the current CI run (GitHub Actions and GitLab CI, plus a generic `PULL_REQUEST_TITLE` fallback) and attaches it to the preview deployment as the `workers/pull_request_title` annotation, alongside the existing pull request number/URL, repository URL, and commit SHA annotations.

This is best effort: if no pull request title can be detected, nothing changes.
