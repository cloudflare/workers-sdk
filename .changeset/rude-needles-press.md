---
"wrangler": patch
---

Update the Wrangler autoconfig logic to work with the latest version of Waku

The latest version of Waku (`0.12.5-1.0.0-alpha.1-0`) requires a `src/waku.server.tsx` file instead of a `src/server-entry.tsx` one, so the Wrangler autoconfig logic (the logic being run as part of `wrangler setup` and `wrangler deploy --x-autoconfig` that configures a project to be deployable on Cloudflare) has been updated accordingly.

Also the way to how the worker needs to handle static assets has been updated as recommended from the Waku team.
