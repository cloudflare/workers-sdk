# @cloudflare/workers-utils

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
