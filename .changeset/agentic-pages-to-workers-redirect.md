---
"wrangler": minor
---

Redirect agent-driven static Pages deploys to Workers

When `wrangler pages deploy` or `wrangler pages project create` is run by an AI coding agent against a brand-new, purely static project, Wrangler now deploys it to Workers static assets (using autoconfig) instead of Cloudflare Pages. Existing Pages projects, non-agent (human) sessions, and projects using Pages features that can't be carried across to Workers (Pages Functions, a `_worker.js`, or a `_redirects` / `_headers` / `_routes.json` file) are unaffected and continue to use Pages. Passing `--force` to either command opts out of the redirect and deploys to Pages directly. Once the Workers deploy starts it is not silently swapped back to Pages: if it fails, the error is surfaced and the `--force` opt-out is suggested.
