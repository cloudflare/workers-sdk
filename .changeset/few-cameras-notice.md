---
"wrangler": patch
---

Add framework id, build command, and deploy command to the `autoconfig_summary` field in the deploy output entry

Add the framework id alongside the commands to build and deploy the project to the output being printed by `wrangler deploy` to `WRANGLER_OUTPUT_FILE_DIRECTORY` or `WRANGLER_OUTPUT_FILE_PATH`.

For example for an npm astro project these would be:

- framework id: 'astro'
- build command: 'npm run build'
- deploy command: 'npx wrangler deploy'

While for a Next.js project they would instead be:

- framework id: 'next'
- build command: 'npx @opennextjs/cloudflare build'
- deploy command: 'npx @opennextjs/cloudflare deploy'
