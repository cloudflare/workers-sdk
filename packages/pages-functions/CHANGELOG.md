# @cloudflare/pages-functions

## 0.1.2

### Patch Changes

- [#16403](https://github.com/cloudflare/workers-sdk/pull/16403) [`5f82a56`](https://github.com/cloudflare/workers-sdk/commit/5f82a5699d3e5a58c3218c7c375d780d54cadf4e) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update `DEFAULT_COMPAT_DATE` to 2026-10-22

  Use the bundled workerd release's compatibility date by default when scaffolding new projects or when no compatibility date is configured.

- [#16437](https://github.com/cloudflare/workers-sdk/pull/16437) [`e651d7c`](https://github.com/cloudflare/workers-sdk/commit/e651d7c0dd8e171dcc1820679f9f46601971d876) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update `DEFAULT_COMPAT_DATE` to 2026-10-23

  Use the bundled workerd release's compatibility date by default when scaffolding new projects or when no compatibility date is configured.

## 0.1.1

### Patch Changes

- [#16139](https://github.com/cloudflare/workers-sdk/pull/16139) [`2d1d563`](https://github.com/cloudflare/workers-sdk/commit/2d1d563e0076cdb524d44b9bab4eca2d610bd21d) Thanks [@cpojer](https://github.com/cpojer)! - Update esbuild to 0.28.2

  Align esbuild dependency with tooling using the latest 0.28 patch so package managers can share one installation instead of downloading a second native binary.

- [#16003](https://github.com/cloudflare/workers-sdk/pull/16003) [`6947df3`](https://github.com/cloudflare/workers-sdk/commit/6947df3ceb107605d766fae3ea461f9281c93a9f) Thanks [@oddharsh](https://github.com/oddharsh)! - Ship `using` and `await using` declarations to the runtime as written, for smaller Worker bundles

  Workers and Pages Functions that use explicit resource management no longer carry about 1 KB of bundled helper code to emulate it. workerd supports `using` and `await using` natively at every compatibility date, so `wrangler deploy`, `wrangler versions upload` and Pages Functions builds now leave these declarations untouched.

## 0.1.0

### Minor Changes

- [#14785](https://github.com/cloudflare/workers-sdk/pull/14785) [`5e6556a`](https://github.com/cloudflare/workers-sdk/commit/5e6556a0c788679b6ac149ba3018a2cfd7cc73e9) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Publish helpers for compiling Pages Functions directories into Workers bundle

  Provides both a programmatic API and a CLI (`pages-functions build`) for converting a Cloudflare Pages `functions/` directory into a Cloudflare Workers bundle:

  ```sh
  npx @cloudflare/pages-functions build ./functions --outdir ./dist
  ```

  The package compiles the Worker and its auxiliary modules, but does not deploy them or generate deployment configuration. Consumers must provide the appropriate Wrangler configuration, including the selected fallback service binding (`ASSETS` by default) when applicable.

- [#14928](https://github.com/cloudflare/workers-sdk/pull/14928) [`f05a0de`](https://github.com/cloudflare/workers-sdk/commit/f05a0ded769dbe8e110da6d690e197dcfd29c74a) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Improve asset directory error messages in Pages Functions builds

  Previously, when an imported asset directory was invalid, a single error message was shown: `'<path>' does not exist or is not a directory`. This has been split into two distinct, actionable messages:

  - `'<path>' does not exist. Please create the directory or check the path and try again.`
  - `'<path>' is not a directory. Please provide a path to a valid directory.`
