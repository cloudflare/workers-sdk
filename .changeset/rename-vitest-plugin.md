---
"@cloudflare/vitest-plugin": major
---

Rename `@cloudflare/vitest-pool-workers` to `@cloudflare/vitest-plugin` for the v1 release

The package has been renamed from `@cloudflare/vitest-pool-workers` to `@cloudflare/vitest-plugin` to better reflect that it is a Vite/Vitest plugin rather than a custom Vitest pool.

To migrate:

1. Replace the dependency in your `package.json`:

   ```diff
   - "@cloudflare/vitest-pool-workers": "^0.16.0"
   + "@cloudflare/vitest-plugin": "^1.0.0"
   ```

2. Update your imports (a codemod is provided):

   ```sh
   npx jscodeshift -t node_modules/@cloudflare/vitest-plugin/dist/codemods/vitest-pool-workers-to-vitest-plugin.mjs vitest.config.ts
   ```

   This rewrites imports such as `import { cloudflareTest } from "@cloudflare/vitest-pool-workers"` to `import { cloudflareTest } from "@cloudflare/vitest-plugin"`, preserving any subpaths.

3. Update the `types` entry in your test `tsconfig.json`:

   ```diff
   - "types": ["@cloudflare/vitest-pool-workers/types"]
   + "types": ["@cloudflare/vitest-plugin/types"]
   ```
