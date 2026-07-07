---
"wrangler": minor
---

Delegate agent-driven static Pages deploys to Workers

When `wrangler pages deploy` or `wrangler pages project create` is run by an AI coding agent against a brand-new, purely static project, Wrangler now delegates it to Workers static assets (using autoconfig) instead of Cloudflare Pages. Accounts that already have Cloudflare Pages projects, non-agent (human) sessions, and projects using Pages features that can't be carried across to Workers (Pages Functions, a `_worker.js`, or a `_routes.json` file) are unaffected and continue to use Pages. Passing `--force` to either command opts out of the delegation and deploys to Pages directly. Once the Workers deploy starts it is not silently swapped back to Pages: if it fails, the error is surfaced and the `--force` opt-out is suggested.
