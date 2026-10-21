---
"@cloudflare/autoconfig": minor
---

Configure Next.js 16 and later projects with vinext when targeting `cf`

Autoconfig now runs `vinext init` (from `vinext@^1.3.0`) instead of `@opennextjs/cloudflare migrate` for projects on Next.js 16 or later that target `cf`. vinext builds the project with the Cloudflare Vite plugin, producing the Build Output that `cf` deploys, and creates the project's `cloudflare.config.ts`. Autoconfig passes `--platform=cloudflare --cdn-cache=none --image-optimization=cloudflare-images --no-prerender` so that `vinext init` does not prompt and can run in agent environments, and passes the selected Worker name with `--name` so that vinext uses it rather than deriving one from `package.json`.

Projects on earlier Next.js versions (including 16.0.0 prereleases), which vinext does not support, and all projects targeting Wrangler continue to be configured with OpenNext.
