# @cloudflare/workers-utils

## 0.18.0

### Minor Changes

- [#13222](https://github.com/cloudflare/workers-sdk/pull/13222) [`5680287`](https://github.com/cloudflare/workers-sdk/commit/56802879641c123ee11160d77ecaf104915cd826) Thanks [@maxwellpeterson](https://github.com/maxwellpeterson)! - Add enabled and previews_enabled support for custom domain routes

  Custom domain routes can now include optional `enabled` and `previews_enabled` boolean fields to control whether a custom domain serves production and/or preview traffic. When omitted, the API defaults apply (production enabled, previews disabled).

- [#13651](https://github.com/cloudflare/workers-sdk/pull/13651) [`47ac63f`](https://github.com/cloudflare/workers-sdk/commit/47ac63f05ca86d781110490ff21ff88f2828fbbf) Thanks [@penalosa](https://github.com/penalosa)! - Publish `@cloudflare/cli-shared-helpers` and `@cloudflare/workers-utils` to npm

## 0.17.0

### Minor Changes

- [#13326](https://github.com/cloudflare/workers-sdk/pull/13326) [`4a9ba90`](https://github.com/cloudflare/workers-sdk/commit/4a9ba90b3f64e94da90343f2694d42f78777e4b7) Thanks [@mattzcarey](https://github.com/mattzcarey)! - Add Artifacts binding support to wrangler

  You can now configure Artifacts bindings in your wrangler configuration:

  ```jsonc
  // wrangler.jsonc
  {
    "artifacts": [{ "binding": "MY_ARTIFACTS", "namespace": "default" }]
  }
  ```

  Type generation produces the correct `Artifacts` type reference from the workerd type definitions:

  ```ts
  interface Env {
    MY_ARTIFACTS: Artifacts;
  }
  ```

- [#13571](https://github.com/cloudflare/workers-sdk/pull/13571) [`7dc0433`](https://github.com/cloudflare/workers-sdk/commit/7dc043315272df2479c17ad204c379515dcc83e8) Thanks [@must108](https://github.com/must108)! - Add regional and jurisdictional placement constraints for Containers. Users can now set `constraints.regions` and `constraints.jurisdiction` in wrangler config to control where containers run.

### Patch Changes

- [#13516](https://github.com/cloudflare/workers-sdk/pull/13516) [`4eb1da9`](https://github.com/cloudflare/workers-sdk/commit/4eb1da9b24247a10a031ecced2cc829243024f84) Thanks [@jonnyparris](https://github.com/jonnyparris)! - Rename "Browser Rendering" to "Browser Run" in all user-facing strings, error messages, and CLI output.

## 0.16.1

### Patch Changes

- [#13468](https://github.com/cloudflare/workers-sdk/pull/13468) [`051db1f`](https://github.com/cloudflare/workers-sdk/commit/051db1fed10091bfd83b30975fbb7f8f00ea1484) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Make all properties in `previews` optional

  All properties in `previews` were previously incorrectly typed as required.

## 0.16.0

### Minor Changes

- [#13139](https://github.com/cloudflare/workers-sdk/pull/13139) [`79fd529`](https://github.com/cloudflare/workers-sdk/commit/79fd529e62b715405aacc0e643a20ce1af3df9f2) Thanks [@roerohan](https://github.com/roerohan)! - feat: add Flagship feature flag binding support

  Adds end-to-end support for the Flagship feature flag binding, which allows Workers to evaluate feature flags from Cloudflare's Flagship service. Configure it in `wrangler.json` with a `flagship` array containing `binding` and `app_id` entries. In local dev, the binding returns default values for all flag evaluations; use `"remote": true` in the binding to evaluate flags against the live Flagship service.

## 0.15.0

### Minor Changes

- [#13011](https://github.com/cloudflare/workers-sdk/pull/13011) [`b9b7e9d`](https://github.com/cloudflare/workers-sdk/commit/b9b7e9d9feec8491f53d144a4fd239cfb66fcd41) Thanks [@ruifigueira](https://github.com/ruifigueira)! - Add experimental headful browser rendering support for local development

  > **Experimental:** This feature may be removed or changed without notice.

  When developing locally with the Browser Rendering API, you can enable headful (visible) mode via the `X_BROWSER_HEADFUL` environment variable to see the browser while debugging:

  ```sh
  X_BROWSER_HEADFUL=true wrangler dev
  X_BROWSER_HEADFUL=true vite dev
  ```

  **Note:** when using `@cloudflare/playwright`, two Chrome windows may appear — the initial blank page and the one created by `browser.newPage()`. This is expected behavior due to how Playwright handles browser contexts via CDP.

- [#13051](https://github.com/cloudflare/workers-sdk/pull/13051) [`d5bffde`](https://github.com/cloudflare/workers-sdk/commit/d5bffdef00618f1d441837a725779d35b176911e) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Remove `formatCompatibilityDate` from the package's public exports

  This utility has been removed from the public API. Callers should use `getTodaysCompatDate()` from `@cloudflare/workers-utils` instead.

- [#13051](https://github.com/cloudflare/workers-sdk/pull/13051) [`d5bffde`](https://github.com/cloudflare/workers-sdk/commit/d5bffdef00618f1d441837a725779d35b176911e) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Remove `getLocalWorkerdCompatibilityDate` from the package

  This utility has been removed because its implementation besides being unreliable is no longer needed. Callers should now use today's date as the compatibility date directly, e.g. via `getTodaysCompatDate()` from `@cloudflare/workers-utils`.

- [#12992](https://github.com/cloudflare/workers-sdk/pull/12992) [`48d83ca`](https://github.com/cloudflare/workers-sdk/commit/48d83ca334e5f668e2d0faaa7a9401e4e1f68a87) Thanks [@RiscadoA](https://github.com/RiscadoA)! - Add `vpc_networks` binding support for routing Worker traffic through a Cloudflare Tunnel or network.

  ```jsonc
  {
    "vpc_networks": [
      // Route through a specific Cloudflare Tunnel
      { "binding": "MY_FIRST_VPC", "tunnel_id": "<tunnel-id>" },
      // Route through the Cloudflare One mesh network
      { "binding": "MY_SECOND_VPC", "network_id": "cf1:network" }
    ]
  }
  ```

- [#13051](https://github.com/cloudflare/workers-sdk/pull/13051) [`d5bffde`](https://github.com/cloudflare/workers-sdk/commit/d5bffdef00618f1d441837a725779d35b176911e) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Add `getTodaysCompatDate()` utility function

  Returns today's date as a `YYYY-MM-DD` string.

## 0.14.0

### Minor Changes

- [#13027](https://github.com/cloudflare/workers-sdk/pull/13027) [`9fcdfca`](https://github.com/cloudflare/workers-sdk/commit/9fcdfca775d3d412abe7547d0833414599bab221) Thanks [@G4brym](https://github.com/G4brym)! - feat: Add `ai_search_namespaces` and `ai_search` binding types

  Two new binding types for AI Search:

  - `ai_search_namespaces`: Namespace binding — `namespace` is required and auto-provisioned at deploy time if it doesn't exist (like R2 buckets)
  - `ai_search`: Single instance binding bound directly to a pre-existing instance in the default namespace

  Both are remote-only in local dev.

### Patch Changes

- [#13018](https://github.com/cloudflare/workers-sdk/pull/13018) [`9c5ebf5`](https://github.com/cloudflare/workers-sdk/commit/9c5ebf56291199eeaec43513732fd3fa7fbd502d) Thanks [@tgarg-cf](https://github.com/tgarg-cf)! - Validate that queue consumers in wrangler config only use the "worker" type

  Previously, non-worker consumer types (e.g. `http_pull`) could be specified in the `queues.consumers` config. Now, wrangler will error if a consumer `type` other than `"worker"` is specified in the config file.

  To configure non-worker consumer types, use the `wrangler queues consumer` CLI commands instead (e.g. `wrangler queues consumer http-pull add`).

## 0.13.0

### Minor Changes

- [#12957](https://github.com/cloudflare/workers-sdk/pull/12957) [`62545c9`](https://github.com/cloudflare/workers-sdk/commit/62545c9e9146d5107df7bd3d75fa3c453fa7d96b) Thanks [@natewong1313](https://github.com/natewong1313)! - Add Stream binding support to Wrangler and workers-utils

  Wrangler and workers-utils now recognize the `stream` binding in configuration, deployment metadata, and generated worker types. This enables projects to declare Stream bindings in `wrangler.json` and have the binding represented consistently across validation, metadata mapping, and type generation.

## 0.12.0

### Minor Changes

- [#12677](https://github.com/cloudflare/workers-sdk/pull/12677) [`eccd014`](https://github.com/cloudflare/workers-sdk/commit/eccd0149000a689d37dfaacdfa6db0989b24bae6) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Add experimental `secrets` property to config validation

- [#12625](https://github.com/cloudflare/workers-sdk/pull/12625) [`c0e9e08`](https://github.com/cloudflare/workers-sdk/commit/c0e9e08356b45243b752af937f463105a58f9a0e) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Add `cache` configuration option for enabling worker cache (experimental)

  You can now enable cache before worker execution using the new `cache` configuration:

  ```jsonc
  {
    "cache": {
      "enabled": true
    }
  }
  ```

  This setting is environment-inheritable and opt-in. When enabled, cache behavior is applied before your worker runs.

  Note: This feature is experimental. The runtime API is not yet generally available.

## 0.11.2

### Patch Changes

- [#12629](https://github.com/cloudflare/workers-sdk/pull/12629) [`603fe18`](https://github.com/cloudflare/workers-sdk/commit/603fe181be7c06b9afa1e7741ef8edfc02fa8e22) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Add `removeDir` and `removeDirSync` helpers with automatic retry logic for Windows EBUSY errors

  These new helpers wrap `fs.rm`/`fs.rmSync` with `maxRetries: 5` and `retryDelay: 100` to handle cases where file handles aren't immediately released (common on Windows with workerd).
  The async helper also has a `fireAndForget` option to silently swallow errors and not await removal.

  This improves reliability of cleanup operations across the codebase.

## 0.11.1

### Patch Changes

- [#12601](https://github.com/cloudflare/workers-sdk/pull/12601) [`ebdbe52`](https://github.com/cloudflare/workers-sdk/commit/ebdbe52c2bcd1b30758b54de57a046f3ab196f04) Thanks [@43081j](https://github.com/43081j)! - Switch to `empathic` for file-system upwards traversal to reduce dependency bloat.

- [#12602](https://github.com/cloudflare/workers-sdk/pull/12602) [`58a4020`](https://github.com/cloudflare/workers-sdk/commit/58a4020eaafcb56cb81dd7d08c58d3d75da08603) Thanks [@anonrig](https://github.com/anonrig)! - Optimize filesystem operations by using Node.js's throwIfNoEntry: false option

  This reduces the number of system calls made when checking for file existence by avoiding the overhead of throwing and catching errors for missing paths. This is an internal performance optimization with no user-visible behavioral changes.

## 0.11.0

### Minor Changes

- [#12466](https://github.com/cloudflare/workers-sdk/pull/12466) [`caf9b11`](https://github.com/cloudflare/workers-sdk/commit/caf9b114391d7708b38e8d37bca6dae6f2b4927e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Add `WRANGLER_CACHE_DIR` environment variable and smart cache directory detection

  Wrangler now intelligently detects where to store cache files:

  1. Use `WRANGLER_CACHE_DIR` env var if set
  2. Use existing cache directory if found (`node_modules/.cache/wrangler` or `.wrangler/cache`)
  3. Create cache in `node_modules/.cache/wrangler` if `node_modules` exists
  4. Otherwise use `.wrangler/cache`

  This improves compatibility with Yarn PnP, pnpm, and other package managers that don't use traditional `node_modules` directories, without requiring any configuration.

## 0.10.0

### Minor Changes

- [#12461](https://github.com/cloudflare/workers-sdk/pull/12461) [`8809411`](https://github.com/cloudflare/workers-sdk/commit/880941158c82e4d907538bfdede06ed0ce5d772d) Thanks [@penalosa](https://github.com/penalosa)! - Support `type: inherit` bindings when using startWorker()

  This is an internal binding type that should not be used by external users of the API

## 0.9.1

### Patch Changes

- [#12368](https://github.com/cloudflare/workers-sdk/pull/12368) [`bd4bb98`](https://github.com/cloudflare/workers-sdk/commit/bd4bb98677f065f19872bbf05024b6ad13284a89) Thanks [@KianNH](https://github.com/KianNH)! - Preserve Containers configuration when using `versions` commands

  Previously, commands like `wrangler versions upload` would inadvertently disable Containers on associated Durable Object namespaces because the `containers` property was being omitted from the API request body.

## 0.9.0

### Minor Changes

- [#11803](https://github.com/cloudflare/workers-sdk/pull/11803) [`1bd1488`](https://github.com/cloudflare/workers-sdk/commit/1bd1488b1eb1d88aa854e8938acc88cdc0ce7f29) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Add a new `subrequests` limit to the `limits` field of the Wrangler configuration file

  Before only the `cpu_ms` limit was supported in the `limits` field of the Wrangler configuration file, now a `subrequests` limit can be specified as well which enables the user to limit the number of fetch requests that a Worker's invocation can make.

  Example:

  ```json
  {
    "$schema": "./node_modules/wrangler/config-schema.json",
    "limits": {
      "cpu_ms": 1000,
      "subrequests": 150 // newly added field
    }
  }
  ```

## 0.8.1

### Patch Changes

- [#12156](https://github.com/cloudflare/workers-sdk/pull/12156) [`abd2b71`](https://github.com/cloudflare/workers-sdk/commit/abd2b716a526d2ae33b3dfab478f3ab4bdea840d) Thanks [@irvinebroque](https://github.com/irvinebroque)! - Fix compatibility date detection failing when creating new projects

  Previously, `getLocalWorkerdCompatibilityDate()` would fail to find the locally installed `miniflare` and `workerd` packages, causing `npm create cloudflare@latest` to fall back to a hardcoded date (2025-09-27) instead of using the current workerd compatibility date.

  The issue was that `module.createRequire()` was called with a directory path. Node.js treats this as a filename at that location and looks for `node_modules` in the parent directory rather than the intended directory. This is now fixed by appending `package.json` to the path, which ensures module resolution starts from the correct location.

  Fixes #12155

- [#11969](https://github.com/cloudflare/workers-sdk/pull/11969) [`9acb24b`](https://github.com/cloudflare/workers-sdk/commit/9acb24b27470ab741bb181bb0e7c21947449507b) Thanks [@emily-shen](https://github.com/emily-shen)! - Validate environments for unexpected fields in Wrangler config

  Previously, this check only applied to the top-level environment.

## 0.8.0

### Minor Changes

- [#12008](https://github.com/cloudflare/workers-sdk/pull/12008) [`e414f05`](https://github.com/cloudflare/workers-sdk/commit/e414f05271887ed43a9a0a660d66565e9847c489) Thanks [@penalosa](https://github.com/penalosa)! - Add support for customising the inspector IP address

  Adds a new `--inspector-ip` CLI flag and `dev.inspector_ip` configuration option to allow customising the IP address that the inspector server listens on. Previously, the inspector was hardcoded to listen only on `127.0.0.1`.

  Example usage:

  ```bash
  # CLI flag
  wrangler dev --inspector-ip 0.0.0.0
  ```

  ```jsonc
  // wrangler.json
  {
    "dev": {
      "inspector_ip": "0.0.0.0"
    }
  }
  ```

- [#12034](https://github.com/cloudflare/workers-sdk/pull/12034) [`05714f8`](https://github.com/cloudflare/workers-sdk/commit/05714f871022e998dfbd7005f795d2fa3b9aee56) Thanks [@emily-shen](https://github.com/emily-shen)! - Add a no-op local explorer worker, which is gated by the experimental flag `X_LOCAL_EXPLORER`.

## 0.7.1

### Patch Changes

- [#11946](https://github.com/cloudflare/workers-sdk/pull/11946) [`fa39a73`](https://github.com/cloudflare/workers-sdk/commit/fa39a73040dd27d35d429deda34fdc8e15b15fbe) Thanks [@MattieTK](https://github.com/MattieTK)! - Fix `configFileName` returning wrong filename for `.jsonc` config files

  Previously, users with a `wrangler.jsonc` config file would see error messages and hints referring to `wrangler.json` instead of `wrangler.jsonc`. This was because the `configFormat` function collapsed both `.json` and `.jsonc` files into a single `"jsonc"` value, losing the distinction between them.

  Now `configFormat` returns `"json"` for `.json` files and `"jsonc"` for `.jsonc` files, allowing `configFileName` to return the correct filename for each format.

## 0.7.0

### Minor Changes

- [#11755](https://github.com/cloudflare/workers-sdk/pull/11755) [`0f8d69d`](https://github.com/cloudflare/workers-sdk/commit/0f8d69d31071abeb567aa3c8478492536b5740fb) Thanks [@nikitassharma](https://github.com/nikitassharma)! - Users can now specify `constraints.tiers` for their container applications. `tier` is deprecated in favor of `tiers`.
  If left unset, we will default to `tiers: [1, 2]`.
  Note that `constraints` is an experimental feature.

## 0.6.0

### Minor Changes

- [#11702](https://github.com/cloudflare/workers-sdk/pull/11702) [`f612b46`](https://github.com/cloudflare/workers-sdk/commit/f612b4683a7e1408709ad378fb6c5b96af485d49) Thanks [@gpanders](https://github.com/gpanders)! - Add support for trusted_user_ca_keys in Wrangler

  You can now configure SSH trusted user CA keys for containers. Add the following to your wrangler.toml:

  ```toml
  [[containers.trusted_user_ca_keys]]
  public_key = "ssh-ed25519 AAAAC3..."
  ```

  This allows you to specify CA public keys that can be used to verify SSH user certificates.

- [#11620](https://github.com/cloudflare/workers-sdk/pull/11620) [`25f6672`](https://github.com/cloudflare/workers-sdk/commit/25f66726d3b2f55a6139273e8f307f0cf3c44422) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Expose a new `getLocalWorkerdCompatibilityDate` utility that allows callers to get the compatibility date of the locally installed `workerd` package.

- [#11616](https://github.com/cloudflare/workers-sdk/pull/11616) [`fc95831`](https://github.com/cloudflare/workers-sdk/commit/fc958315f7f452155385628092db822badc09404) Thanks [@NuroDev](https://github.com/NuroDev)! - Add type generation support to `wrangler dev`

  You can now have your worker configuration types be automatically generated when the local Wrangler development server starts.

  To use it you can either:

  1. Add the `--types` flag when running `wrangler dev`.
  2. Update your Wrangler configuration file to add the new `dev.generate_types` boolean property.

  ```json
  {
    "$schema": "node_modules/wrangler/config-schema.json",
    "name": "example",
    "main": "src/index.ts",
    "compatibility_date": "2025-12-12",
    "dev": {
      "generate_types": true
    }
  }
  ```

- [#11620](https://github.com/cloudflare/workers-sdk/pull/11620) [`25f6672`](https://github.com/cloudflare/workers-sdk/commit/25f66726d3b2f55a6139273e8f307f0cf3c44422) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Expose new `isCompatDate` utility that discerns whether a string represents a compatibility date or not

### Patch Changes

- [#11737](https://github.com/cloudflare/workers-sdk/pull/11737) [`2cfea12`](https://github.com/cloudflare/workers-sdk/commit/2cfea12660d0ab2841d230889de6ff628792223e) Thanks [@NuroDev](https://github.com/NuroDev)! - Fix the `triggers` JSON schema default value to use valid JSON (`{"crons":[]}`) instead of an invalid JavaScript literal, which was causing IDE auto-completion to insert a string rather than an object.

- [#11651](https://github.com/cloudflare/workers-sdk/pull/11651) [`d123ad0`](https://github.com/cloudflare/workers-sdk/commit/d123ad006d72bdee97cce5f4857e6d06a6fc16da) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Surface error in diagnostics when TOML date/time values are used in `vars`

  TOML parses unquoted date/time values like `DATE = 2024-01-01` as TOML Date, Date-Time, and Time values. The config validation now surfaces an error in the diagnostics result when this type of values are encountered, with a clear message telling you to quote the value as a string, e.g. `DATE = "2024-01-01"`.

- [#11693](https://github.com/cloudflare/workers-sdk/pull/11693) [`385ec7f`](https://github.com/cloudflare/workers-sdk/commit/385ec7fe17b7e06d669481448555282e5a982626) Thanks [@vicb](https://github.com/vicb)! - Update the signature of ParseTOML to drop the Generics.

  Use an explicit cast where required.

## 0.5.0

### Minor Changes

- [#11661](https://github.com/cloudflare/workers-sdk/pull/11661) [`4b3fba2`](https://github.com/cloudflare/workers-sdk/commit/4b3fba29795797c50bee2b18e21a299727e295f7) Thanks [@edmundhung](https://github.com/edmundhung)! - Add `getOpenNextDeployFromEnv()` environment variable helper which will be used to signal the current process is being run by the open-next deploy command.

- [#11621](https://github.com/cloudflare/workers-sdk/pull/11621) [`90c0676`](https://github.com/cloudflare/workers-sdk/commit/90c067631419d2590dc4338342e622dbc782f201) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Expose `writeWranglerConfig`, `writeDeployRedirectConfig`, `writeRedirectedWranglerConfig` and `readWranglerConfig` from `/test-helpers`

## 0.4.0

### Minor Changes

- [#10937](https://github.com/cloudflare/workers-sdk/pull/10937) [`9514c9a`](https://github.com/cloudflare/workers-sdk/commit/9514c9a0ed28fed349126384d1f646c9165be914) Thanks [@ReppCodes](https://github.com/ReppCodes)! - Add support for "targeted" placement mode with region, host, and hostname fields

  This change adds a new mode to `placement` configuration. You can specify one of the following fields to target specific external resources for Worker placement:

  - `region`: Specify a region identifier (e.g., "aws:us-east-1") to target a region from another cloud service provider
  - `host`: Specify a host with (required) port (e.g., "example.com:8123") to target a TCP service
  - `hostname`: Specify a hostname (e.g., "example.com") to target an HTTP resource

  These fields are mutually exclusive - only one can be specified at a time.

  Example configuration:

  ```toml
  [placement]
  host = "example.com:8123"
  ```

## 0.3.0

### Minor Changes

- [#11349](https://github.com/cloudflare/workers-sdk/pull/11349) [`aa4a5f1`](https://github.com/cloudflare/workers-sdk/commit/aa4a5f112e22c2b1697cbc06eebb0aec362f3032) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Adds a new `test-helpers` entry-point to the workers-utils package

- [#11228](https://github.com/cloudflare/workers-sdk/pull/11228) [`43903a3`](https://github.com/cloudflare/workers-sdk/commit/43903a38f00d2a0da1d19a9be1fc90a4e38454cf) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Support `CLOUDFLARE_ENV` environment variable for selecting the active environment

  This change enables users to select the environment for commands such as `CLOUDFLARE_ENV=prod wrangler versions upload`. The `--env` command line argument takes precedence.

  The `CLOUDFLARE_ENV` environment variable is mostly used with the `@cloudflare/vite-plugin` to select the environment for building the Worker to be deployed. This build also generates a "redirected deploy config" that is flattened to only contain the active environment.
  To avoid accidentally deploying a version that is built for one environment to a different environment, there is an additional check to ensure that if the user specifies an environment in Wrangler it matches the original selected environment from the build.

## 0.2.0

### Minor Changes

- [#11233](https://github.com/cloudflare/workers-sdk/pull/11233) [`c922a81`](https://github.com/cloudflare/workers-sdk/commit/c922a810808f640b82fcad08a96363323029de83) Thanks [@emily-shen](https://github.com/emily-shen)! - Add `containers.unsafe` to allow internal users to use additional container features

## 0.1.2

### Patch Changes

- [#11339](https://github.com/cloudflare/workers-sdk/pull/11339) [`dfba912`](https://github.com/cloudflare/workers-sdk/commit/dfba9126615993b7bbb6d8bf7d1e31b5eebab9f6) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Fix `mapWorkerMetadataBindings` and `constructWranglerConfig` incorrectly throwing an error when encountering assets bindings

  Currently `mapWorkerMetadataBindings` and `constructWranglerConfig` when provided data containing an assets binding throw the
  following error:

  ```
   the error "`wrangler init --from-dash` is not yet supported for Workers with Assets"
  ```

  This is incorrect and `wrangler init` specific, the changes here make sure that such error is not thrown and that the assets
  binding is instead handled

## 0.1.1

### Patch Changes

- [#11286](https://github.com/cloudflare/workers-sdk/pull/11286) [`8e99766`](https://github.com/cloudflare/workers-sdk/commit/8e99766700b03c17bdaf9153112c466acea74f9b) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make sure that `experimental_patchConfig` doesn't throw if it encounters a `null` value

- [#11266](https://github.com/cloudflare/workers-sdk/pull/11266) [`09cb720`](https://github.com/cloudflare/workers-sdk/commit/09cb720182dbdd5e403af2c9eae75461c4058682) Thanks [@penalosa](https://github.com/penalosa)! - Use the smol-toml library for parsing TOML instead of @iarna/toml

- [#11269](https://github.com/cloudflare/workers-sdk/pull/11269) [`03cbd48`](https://github.com/cloudflare/workers-sdk/commit/03cbd48f28f5f2754eba97c2ca134249cc10de02) Thanks [@vicb](https://github.com/vicb)! - export property validators

- [#11286](https://github.com/cloudflare/workers-sdk/pull/11286) [`8e99766`](https://github.com/cloudflare/workers-sdk/commit/8e99766700b03c17bdaf9153112c466acea74f9b) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: In `constructWranglerConfig` make sure that if the API value of `tail_consumers` is `null` that is converted to `undefined` (since `null` is not a valid `tail_consumers` config value)

## 0.1.0

### Minor Changes

- [#11146](https://github.com/cloudflare/workers-sdk/pull/11146) [`d7a2037`](https://github.com/cloudflare/workers-sdk/commit/d7a203771569942a822d4943999db4d946101669) Thanks [@penalosa](https://github.com/penalosa)! - Change the input types of `constructWranglerConfig()` to better match the API

## 0.0.2

### Patch Changes

- [#11097](https://github.com/cloudflare/workers-sdk/pull/11097) [`55657eb`](https://github.com/cloudflare/workers-sdk/commit/55657eb0dfa01ef9081a3510c4ba2b90243f2978) Thanks [@penalosa](https://github.com/penalosa)! - First publish of a WIP experimental utils package.

- [#11118](https://github.com/cloudflare/workers-sdk/pull/11118) [`d47f166`](https://github.com/cloudflare/workers-sdk/commit/d47f166499dd1a38c245ba06d1a2c150b2d6ef80) Thanks [@zebp](https://github.com/zebp)! - Fix validation of the `persist` field of observability `logs` and `traces` configuration
