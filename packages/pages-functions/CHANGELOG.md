# @cloudflare/pages-functions

## 0.1.8

### Patch Changes

- [#16810](https://github.com/cloudflare/workers-sdk/pull/16810) [`cdc970b`](https://github.com/cloudflare/workers-sdk/commit/cdc970b7bd39dcd42af65bdadab7c38ce0b409fb) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update `DEFAULT_COMPAT_DATE` to 2026-11-10

  Use the bundled workerd release's compatibility date by default when scaffolding new projects or when no compatibility date is configured.

## 0.1.7

### Patch Changes

- [#16746](https://github.com/cloudflare/workers-sdk/pull/16746) [`abf924e`](https://github.com/cloudflare/workers-sdk/commit/abf924ee1820b4af139f21dffc877eaf6122c056) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update `DEFAULT_COMPAT_DATE` to 2026-11-06

  Use the bundled workerd release's compatibility date by default when scaffolding new projects or when no compatibility date is configured.

- [#16792](https://github.com/cloudflare/workers-sdk/pull/16792) [`de10016`](https://github.com/cloudflare/workers-sdk/commit/de100160f243451355480e8f815d0f7d4b3ec8b9) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update `DEFAULT_COMPAT_DATE` to 2026-11-09

  Use the bundled workerd release's compatibility date by default when scaffolding new projects or when no compatibility date is configured.

## 0.1.6

### Patch Changes

- [#16695](https://github.com/cloudflare/workers-sdk/pull/16695) [`b2061f4`](https://github.com/cloudflare/workers-sdk/commit/b2061f40f812d8888b461f68506552b58f8e468b) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update `DEFAULT_COMPAT_DATE` to 2026-11-04

  Use the bundled workerd release's compatibility date by default when scaffolding new projects or when no compatibility date is configured.

## 0.1.5

### Patch Changes

- [#16670](https://github.com/cloudflare/workers-sdk/pull/16670) [`b14b9dc`](https://github.com/cloudflare/workers-sdk/commit/b14b9dcc360d1e05bb29a87287624603c2c60815) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update `DEFAULT_COMPAT_DATE` to 2026-11-03

  Use the bundled workerd release's compatibility date by default when scaffolding new projects or when no compatibility date is configured.

## 0.1.4

### Patch Changes

- [#16642](https://github.com/cloudflare/workers-sdk/pull/16642) [`d38cb02`](https://github.com/cloudflare/workers-sdk/commit/d38cb020c1540f61126657d0ae077972c0e23b67) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update `DEFAULT_COMPAT_DATE` to 2026-11-02

  Use the bundled workerd release's compatibility date by default when scaffolding new projects or when no compatibility date is configured.

## 0.1.3

### Patch Changes

- [#16635](https://github.com/cloudflare/workers-sdk/pull/16635) [`76e18a8`](https://github.com/cloudflare/workers-sdk/commit/76e18a8fb42ac9df45e052c8c2d8747873fb1286) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update `DEFAULT_COMPAT_DATE` to 2026-11-01

  Use the bundled workerd release's compatibility date by default when scaffolding new projects or when no compatibility date is configured.

- [#16603](https://github.com/cloudflare/workers-sdk/pull/16603) [`2667a9f`](https://github.com/cloudflare/workers-sdk/commit/2667a9f1e5dabd0ca5c9a238f3c6a1ca0719d935) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Fix repeated slashes in URL paths bypassing Pages Functions middleware

  Pages Functions now collapse repeated slashes when looking up middleware, so requests such as `//secure/one` run the same middleware as `/secure/one`. The original request URL and function-route matching are preserved. Middleware receives a `functionPath` prefix from the original URL so imported assets can still resolve their relative paths.

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
