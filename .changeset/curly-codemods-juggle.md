---
"@cloudflare/codemod": minor
"@cloudflare/vitest-pool-workers": minor
---

Add a central CLI for Cloudflare codemods

Run `npx @cloudflare/codemod vitest` to intelligently apply every relevant Vitest migration, or select an individual migration by name. The initial migrations cover Vitest v3 to v4 configuration and the `@cloudflare/vitest-pool-workers` to `@cloudflare/vitest-plugin` v1 rename. The existing Vitest transform now lives in this dedicated package.
