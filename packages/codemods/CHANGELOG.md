# @cloudflare/codemods

## 0.2.0

### Minor Changes

- [#15782](https://github.com/cloudflare/workers-sdk/pull/15782) [`ae21b5e`](https://github.com/cloudflare/workers-sdk/commit/ae21b5e3e183fff028618eed8e8a7b3eb5afb75f) Thanks [@NuroDev](https://github.com/NuroDev)! - Require a clean Git worktree before running codemods

  Codemods now stop before changing files when the target Git worktree contains staged, unstaged, or untracked changes. Pass `--force` to bypass this safety check.

- [#15784](https://github.com/cloudflare/workers-sdk/pull/15784) [`809978d`](https://github.com/cloudflare/workers-sdk/commit/809978dbd1ba4aa9ef3bc62dd7495b88478c5bd8) Thanks [@NuroDev](https://github.com/NuroDev)! - Add a public module entrypoint for programmatic codemod APIs

  The package now exports `runCodemod` with its context and result types for programmatic use.

- [#15851](https://github.com/cloudflare/workers-sdk/pull/15851) [`74a520e`](https://github.com/cloudflare/workers-sdk/commit/74a520ea55c56e8f61764bfdcff1c5aceabcfefd) Thanks [@NuroDev](https://github.com/NuroDev)! - Add a Wrangler-to-cf configuration migration

  The new `wrangler-to-cf` codemod and `migrateWranglerToCf()` API write `cloudflare.config.ts`, preserve supported environments and bindings, and report manual follow-up work without reading secret files. Wrangler-specific tooling can optionally be written to `wrangler.config.ts` for projects that retain Wrangler's bundler.

### Patch Changes

- [#15851](https://github.com/cloudflare/workers-sdk/pull/15851) [`74a520e`](https://github.com/cloudflare/workers-sdk/commit/74a520ea55c56e8f61764bfdcff1c5aceabcfefd) Thanks [@NuroDev](https://github.com/NuroDev)! - Preserve top-level Wrangler tooling settings when migrating named environments

  Named-environment values for top-level-only fields are ignored by Wrangler. The migration now retains top-level settings for every generated mode instead of converting invalid overrides into mode-specific behavior.

- [#15870](https://github.com/cloudflare/workers-sdk/pull/15870) [`8c4b8a3`](https://github.com/cloudflare/workers-sdk/commit/8c4b8a3ee8d2f6cc6df96338ee819d25a10a7394) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Keep Node.js ESM packages working when consumers rebundle them as CommonJS

  Node.js-targeted ESM bundles now provide a real `require` implementation for bundled CommonJS dependencies. This avoids downstream patches for dynamic require calls and keeps the packages usable when a consumer rebundles them to CommonJS.

## 0.1.0

### Minor Changes

- [#14690](https://github.com/cloudflare/workers-sdk/pull/14690) [`d81fae7`](https://github.com/cloudflare/workers-sdk/commit/d81fae7487abee539d985c348dddf39bca3196f7) Thanks [@penalosa](https://github.com/penalosa)! - Add a central CLI for Cloudflare codemods

  Run a codemod by name, e.g. `npx @cloudflare/codemods vitest:v3-to-v4`. The initial migrations cover Vitest v3 to v4 configuration (`vitest:v3-to-v4`) and the `@cloudflare/vitest-pool-workers` to `@cloudflare/vitest-plugin` v1 rename (`vitest:pool-workers-to-vitest-plugin`). The existing Vitest transform now lives in this dedicated package.
