---
"wrangler": minor
---

Add CF_PAGES environment variables to `wrangler pages dev`

`wrangler pages dev` now automatically injects Pages-specific environment variables (`CF_PAGES`, `CF_PAGES_BRANCH`, `CF_PAGES_COMMIT_SHA`, `CF_PAGES_URL`) for improved dev/prod parity. This enables frameworks like SvelteKit to auto-detect the Pages environment during local development.

- `CF_PAGES` is set to `"1"` to indicate the Pages environment
- `CF_PAGES_BRANCH` defaults to the current git branch (or `"local"` if not in a git repo)
- `CF_PAGES_COMMIT_SHA` defaults to the current git commit SHA (or a placeholder if not in a git repo)
- `CF_PAGES_URL` is set to a simulated commit preview URL (e.g., `https://<sha>.<project-name>.pages.dev`)

These variables are displayed with their actual values in the bindings table during startup, making it easy to verify what branch and commit SHA were detected.

These variables can be overridden by user-defined vars in the Wrangler configuration, `.env`, `.dev.vars`, or via CLI flags.
