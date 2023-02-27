---
"wrangler": minor
---

chore: upgrade `@miniflare/tre` to [`3.0.0-next.12`](https://github.com/cloudflare/miniflare/releases/tag/v3.0.0-next.12), incorporating changes from [`3.0.0-next.11`](https://github.com/cloudflare/miniflare/releases/tag/v3.0.0-next.11)

Notably, this brings the following improvements to `wrangler dev --experimental-local`:

- Adds support for Durable Objects and D1
- Fixes an issue blocking clean exits and script reloads
- Bumps to `better-sqlite3@8`, allowing installation on Node 19
