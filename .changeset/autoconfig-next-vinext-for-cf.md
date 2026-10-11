---
"@cloudflare/autoconfig": minor
---

Configure Next.js 16 projects with vinext when targeting `cf`

Autoconfig now runs `vinext init` instead of `@opennextjs/cloudflare migrate` for Next.js 16 projects targeting `cf`. vinext builds the project with the Cloudflare Vite plugin, producing the Build Output that `cf` deploys, and creates the project's `cloudflare.config.ts`. Autoconfig passes `--platform=cloudflare --cdn-cache=none --image-optimization=cloudflare-images --no-prerender` so that `vinext init` does not prompt and can run in agent environments.

Projects on earlier Next.js versions, which vinext does not support, and all projects targeting Wrangler continue to be configured with OpenNext.
