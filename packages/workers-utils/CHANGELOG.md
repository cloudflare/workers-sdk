# @cloudflare/workers-utils

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
