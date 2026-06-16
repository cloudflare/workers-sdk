---
"wrangler": minor
---

Redirect agent-driven static Pages deploys to Workers

When `wrangler pages deploy` or `wrangler pages project create` is run by an AI coding agent against a brand-new, purely static project, Wrangler now deploys it to Workers static assets (using autoconfig) instead of Cloudflare Pages. Existing Pages projects, projects containing Pages Functions or a `_worker.js`, and non-agent (human) sessions are unaffected and continue to use Pages. If the Workers deploy fails for any reason, Wrangler falls back to the original Pages command.
