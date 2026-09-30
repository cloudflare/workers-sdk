# @cloudflare/codemods

## 0.3.0

### Minor Changes

- [#15685](https://github.com/cloudflare/workers-sdk/pull/15685) [`b9f1cdc`](https://github.com/cloudflare/workers-sdk/commit/b9f1cdc198533687f6b64ce72499a3ca04b2bf85) Thanks [@Ankcorn](https://github.com/Ankcorn)! - Add native support for the Analytics SQL binding

  Declare the zero-configuration binding in `wrangler.json` with `"analytics": { "binding": "ANALYTICS" }`. Wrangler uploads the `analytics` binding type and proxies it to the remote service during local development, so `wrangler dev` can call the binding without `unsafe.bindings`.

- [#15948](https://github.com/cloudflare/workers-sdk/pull/15948) [`a0712e5`](https://github.com/cloudflare/workers-sdk/commit/a0712e578e45908ed5e46235828a434b49cf8f22) Thanks [@akoval-cf](https://github.com/akoval-cf)! - Migrate beta K2 producer bindings in the `wrangler-to-cf` codemod

  `k2` entries in a Wrangler configuration file are converted to `bindings.k2({ stream })`. A `remote` setting is carried over as `dev.remote`.

## 0.2.1

### Patch Changes

- [#15894](https://github.com/cloudflare/workers-sdk/pull/15894) [`bfe108c`](https://github.com/cloudflare/workers-sdk/commit/bfe108cd842f76538047409d48904076515dc3ce) Thanks [@MattieTK](https://github.com/MattieTK)! - Stop blocking Vite migrations on `upload_source_maps`

  The `wrangler-to-cf` codemod previously treated any `upload_source_maps` setting as unsupported Wrangler tooling when the Vite bundler was selected, which added a migration guard to `cloudflare.config.ts`. It now reports non-blocking guidance instead, because `cf deploy` uploads any Worker source maps included in the build output. For `upload_source_maps: true`, the guidance says to enable `build.sourcemap` for the Worker's Vite environment. For `upload_source_maps: false`, it says to keep that setting disabled.

- [#15894](https://github.com/cloudflare/workers-sdk/pull/15894) [`bfe108c`](https://github.com/cloudflare/workers-sdk/commit/bfe108cd842f76538047409d48904076515dc3ce) Thanks [@MattieTK](https://github.com/MattieTK)! - Report an unmigrated Vite assets directory once

  Vite migrations previously reported `assets.directory` both as Wrangler tooling and as a separate assets follow-up. The codemod now reports only the assets-specific follow-up, which includes a documentation link.

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
