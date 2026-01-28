---
"wrangler": patch
---

Add framework id, build command, and deploy command to the `autoconfig_summary` field in the deploy output entry

Add the framework id alongside the commands to build and deploy the project to the output being printed by `wrangler deploy` to `WRANGLER_OUTPUT_FILE_DIRECTORY` or `WRANGLER_OUTPUT_FILE_PATH`.

For example for an npm Astro project these would be:

- Framework id: `astro`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

While for a Next.js project they would instead be:

- Framework id: `next`
- Build command: `npx @opennextjs/cloudflare build`
- Deploy command: `npx @opennextjs/cloudflare deploy`
