---
"@cloudflare/vitest-plugin": major
---

Rename `@cloudflare/vitest-pool-workers` to `@cloudflare/vitest-plugin` for the v1 release

The package has been renamed from `@cloudflare/vitest-pool-workers` to `@cloudflare/vitest-plugin` to better reflect that it is a Vite/Vitest plugin rather than a custom Vitest pool.

To migrate, run the codemod from the root of your project:

```sh
npx @cloudflare/codemods vitest:pool-workers-to-vitest-plugin
```

This handles the whole rename for you:

- Replaces the dependency in your `package.json`, moving plain version ranges to `^1.0.0` while preserving `workspace:`/`catalog:`/`link:`/`file:` protocol references, along with any `overrides`, `resolutions` and `pnpm.overrides` entries.
- Rewrites imports such as `import { cloudflareTest } from "@cloudflare/vitest-pool-workers"` to `import { cloudflareTest } from "@cloudflare/vitest-plugin"`, preserving any subpaths.
- Updates the `types` entry in your test `tsconfig.json` from `@cloudflare/vitest-pool-workers/types` to `@cloudflare/vitest-plugin/types`.

Pass `--dry-run` to preview the changes first, or `--files <glob>` to restrict which files are considered.

If you would rather migrate by hand, the only changes needed are the dependency name in `package.json`, the package specifier in any `import`/`require` of the plugin, and the `types` entry in your test `tsconfig.json`.
