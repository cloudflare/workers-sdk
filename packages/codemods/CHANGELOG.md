# @cloudflare/codemods

## 0.7.0

### Minor Changes

- [#16536](https://github.com/cloudflare/workers-sdk/pull/16536) [`a95d647`](https://github.com/cloudflare/workers-sdk/commit/a95d647f9459e40a00871346b81082abbb27d2b3) Thanks [@WalshyDev](https://github.com/WalshyDev)! - Support remote Analytics Engine bindings in local development

  Setting `remote: true` on an Analytics Engine dataset now sends `writeDataPoint()` calls from `wrangler dev` and the Vite plugin to the real dataset. Without it, writes are still dropped locally.

  ```jsonc
  {
    "analytics_engine_datasets": [
      {
        "binding": "EVENTS",
        "dataset": "my-dataset",
        "remote": true
      }
    ]
  }
  ```

## 0.6.1

### Patch Changes

- [#16403](https://github.com/cloudflare/workers-sdk/pull/16403) [`5f82a56`](https://github.com/cloudflare/workers-sdk/commit/5f82a5699d3e5a58c3218c7c375d780d54cadf4e) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update `DEFAULT_COMPAT_DATE` to 2026-10-22

  Use the bundled workerd release's compatibility date by default when scaffolding new projects or when no compatibility date is configured.

- [#16437](https://github.com/cloudflare/workers-sdk/pull/16437) [`e651d7c`](https://github.com/cloudflare/workers-sdk/commit/e651d7c0dd8e171dcc1820679f9f46601971d876) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update `DEFAULT_COMPAT_DATE` to 2026-10-23

  Use the bundled workerd release's compatibility date by default when scaffolding new projects or when no compatibility date is configured.

## 0.6.0

### Minor Changes

- [#16357](https://github.com/cloudflare/workers-sdk/pull/16357) [`182d6de`](https://github.com/cloudflare/workers-sdk/commit/182d6ded7126c29daa6f8d2eea5f175421b29917) Thanks [@Naapperas](https://github.com/Naapperas)! - Add a `jurisdiction` setting to Workflows

  A Workflow defined by the Worker can now set the jurisdiction that its instances run and store their data in, on either a `workflows` binding or a `workflow` export:

  ```jsonc
  {
    "workflows": [
      {
        "binding": "MY_WORKFLOW",
        "name": "my-workflow",
        "class_name": "MyWorkflow",
        "jurisdiction": "eu"
      }
    ]
  }
  ```

  The accepted values are `eu`, `fedramp`, and `us`. `wrangler deploy` and `wrangler triggers deploy` send the jurisdiction when they create or update the Workflow. A Workflow's jurisdiction is set when it is created and cannot be changed afterwards, so `wrangler deploy` and `wrangler versions upload` stop before uploading when an existing Workflow has a different jurisdiction from the configured one. Leaving `jurisdiction` out keeps the Workflow's existing jurisdiction. `@cloudflare/config` adds the setting to `exports.workflow()`, `cf migrate` carries it over, and `wrangler workflows describe` prints it. Local development ignores it.

## 0.5.1

### Patch Changes

- [#16240](https://github.com/cloudflare/workers-sdk/pull/16240) [`1a0e1a4`](https://github.com/cloudflare/workers-sdk/commit/1a0e1a4efb17ce6e2e02845e6682bb1748633289) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Explain how to preserve dependency metadata opt-outs when migrating to cf

  Wrangler configurations with `dependencies_instrumentation.enabled` set to `false` now receive a migration follow-up directing them to `CLOUDFLARE_DEPENDENCIES_INSTRUMENTATION=false`. Package exclusion lists remain required follow-up work because the environment variable controls dependency metadata as a whole.

## 0.5.0

### Minor Changes

- [#16239](https://github.com/cloudflare/workers-sdk/pull/16239) [`f360829`](https://github.com/cloudflare/workers-sdk/commit/f3608290da40c11b248fff40101f30fc295652be) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Support Cloudflare Access local development configuration in `cloudflare.config.ts`

  Workers can now configure an Access audience and mock identity under `access.dev`, and `cf migrate` preserves this setting when converting a Wrangler configuration. Miniflare v5 now reads the setting from `config.access.dev`, aligning its Worker configuration with `@cloudflare/config`; the Miniflare v4 compatibility adapter continues to accept its existing `access` option.

  ```ts
  export default defineConfig({
    worker: {
      name: "api",
      access: {
        dev: {
          aud: "my-access-audience",
          identity: { email: "developer@example.com" },
        },
      },
    },
  });
  ```

  This is a breaking change for direct Miniflare v5 users: move `workers[].dev.access` to `workers[].config.access.dev`. Miniflare v5 is currently in beta.

## 0.4.2

### Patch Changes

- [#16143](https://github.com/cloudflare/workers-sdk/pull/16143) [`271ac8e`](https://github.com/cloudflare/workers-sdk/commit/271ac8e3fe67e350c4c9a5927c2f981ba320f134) Thanks [@cpojer](https://github.com/cpojer)! - Share bundled dependencies between the CLI and library entry points

  Build both entry points together to avoid shipping the same migration implementation and dependencies twice. The CLI command and public library exports remain unchanged.

## 0.4.1

### Patch Changes

- [#16016](https://github.com/cloudflare/workers-sdk/pull/16016) [`f025bbf`](https://github.com/cloudflare/workers-sdk/commit/f025bbfddcdab0193bffffc9fe5a9bf143f2fa65) Thanks [@Ankcorn](https://github.com/Ankcorn)! - Add `bindings.analytics()` as the preferred name for Analytics SQL bindings and deprecate `bindings.analyticsSQL()`.

- [#15991](https://github.com/cloudflare/workers-sdk/pull/15991) [`b4f6054`](https://github.com/cloudflare/workers-sdk/commit/b4f6054d2f5d9f63f5ab9eb544637d75b2346f59) Thanks [@NuroDev](https://github.com/NuroDev)! - Use the default type generation behavior in projects migrated by `cf migrate`.

  Wrangler projects without `dev.generate_types: false` no longer get a `wrangler.config.ts` solely for a redundant type setting. An explicit opt-out still emits `types.generate: false`, and other Wrangler tooling still produces a config when needed.

- [#15946](https://github.com/cloudflare/workers-sdk/pull/15946) [`1d38b36`](https://github.com/cloudflare/workers-sdk/commit/1d38b36bc57705c1417aa7408aa049cb220eb125) Thanks [@NuroDev](https://github.com/NuroDev)! - Upgrade Wrangler dependencies to a version supported by `cf dev` when Wrangler-to-cf migration generates `wrangler.config.ts`.

  Affected projects receive the latest Wrangler release and an updated lockfile through their existing package manager. Compatible workspace links and existing dependency sections are preserved, and `--no-install` and `--dry-run` avoid package installation.

- [#15947](https://github.com/cloudflare/workers-sdk/pull/15947) [`969f760`](https://github.com/cloudflare/workers-sdk/commit/969f7603f03cb68c1cb7df476e3c67c317852132) Thanks [@NuroDev](https://github.com/NuroDev)! - Upgrade the Vite plugin when migrating a Wrangler project to cf with Vite

  Vite migrations now install `@cloudflare/vite-plugin@beta`, keep the `beta` dist tag in `package.json`, and update the project's lockfile when the existing version is unsupported. Compatible installations remain unchanged, and Wrangler migrations do not update the plugin.

- [#15990](https://github.com/cloudflare/workers-sdk/pull/15990) [`22dbde6`](https://github.com/cloudflare/workers-sdk/commit/22dbde63a5726ba5d17c15270db0b11b50122b79) Thanks [@NuroDev](https://github.com/NuroDev)! - Avoid a manual migration TODO when an R2 binding uses the same production and preview bucket name.

  `cf migrate` now requests manual review only when the preview bucket name differs from the production bucket name.

## 0.4.0

### Minor Changes

- [#15927](https://github.com/cloudflare/workers-sdk/pull/15927) [`7a18975`](https://github.com/cloudflare/workers-sdk/commit/7a1897555f2cda3c0b928110808dbfdab819e7d9) Thanks [@oddharsh](https://github.com/oddharsh)! - Migrate Workflow bindings in `cf migrate`

  The `wrangler-to-cf` codemod now converts `workflows` entries to `bindings.workflow(...)` instead of dropping them, and adds an `exports.workflow(...)` entry, with its settings, for each Workflow the Worker defines itself. It also writes `defaultRetention` in camelCase, which the new config requires. `cf migrate` is in beta.

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
