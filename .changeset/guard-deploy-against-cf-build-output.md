---
"wrangler": minor
---

Stop `wrangler deploy`, `wrangler versions upload` and `wrangler preview` when the project contains Cloudflare Build Output

A project built for the Cloudflare CLI (`cf`) contains a `.cloudflare/output` directory. Deploying it with Wrangler reads a different configuration, so it could target the wrong Worker or fail without explaining why. These commands now stop before doing any work and point to `cf deploy`.

Detection is deliberately assertive: it requires the Build Output Specification's versioned root config, not merely a `.cloudflare` or `.cloudflare/output` directory. Ordinary Wrangler projects are unaffected, including those with the `.cloudflare/types` directory Wrangler generates itself. `--dry-run` is exempt on `deploy` and `versions upload`, because it uploads nothing.
