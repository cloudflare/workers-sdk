# @cloudflare/cli

## 1.2.1

### Patch Changes

- [#11940](https://github.com/cloudflare/workers-sdk/pull/11940) [`69ff962`](https://github.com/cloudflare/workers-sdk/commit/69ff9620487a6ae979f369eb1dbac887ce46e246) Thanks [@penalosa](https://github.com/penalosa)! - Mark macOS version compatibility errors as user errors

  When checking macOS version compatibility, the CLI now throws `UserError` instead of generic `Error`. This ensures that version incompatibility issues are properly classified as user-facing errors that shouldn't be reported to Sentry.

- [#11967](https://github.com/cloudflare/workers-sdk/pull/11967) [`202c59e`](https://github.com/cloudflare/workers-sdk/commit/202c59e4f4f28419fb6ac0aa8c7dc3960a0c8d3e) Thanks [@emily-shen](https://github.com/emily-shen)! - chore: update undici

  The following dependency versions have been updated:

  | Dependency | From   | To     |
  | ---------- | ------ | ------ |
  | undici     | 7.14.0 | 7.18.2 |

## 1.2.0

### Minor Changes

- [#11578](https://github.com/cloudflare/workers-sdk/pull/11578) [`4201472`](https://github.com/cloudflare/workers-sdk/commit/4201472291fa1c864dbcca40c173a76e5b571a04) Thanks [@gpanders](https://github.com/gpanders)! - Add showCursor helper function to show or hide the cursor in the terminal

## 1.1.4

### Patch Changes

- [#11448](https://github.com/cloudflare/workers-sdk/pull/11448) [`2b4813b`](https://github.com/cloudflare/workers-sdk/commit/2b4813b18076817bb739491246313c32b403651f) Thanks [@edmundhung](https://github.com/edmundhung)! - Builds package with esbuild `v0.27.0`

## 1.1.3

### Patch Changes

- [#10764](https://github.com/cloudflare/workers-sdk/pull/10764) [`79a6b7d`](https://github.com/cloudflare/workers-sdk/commit/79a6b7dd811fea5a413b084fcd281915a418a85a) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: respect the log level set by wrangler when logging using @cloudflare/cli

## 1.1.2

### Patch Changes

- [#10492](https://github.com/cloudflare/workers-sdk/pull/10492) [`8ae9323`](https://github.com/cloudflare/workers-sdk/commit/8ae9323a5c45f3efe3685e36b1536cc25d39fbfb) Thanks [@gpanders](https://github.com/gpanders)! - Include cursor in text prompts

## 1.1.1

### Patch Changes

- [#4768](https://github.com/cloudflare/workers-sdk/pull/4768) [`c3e410c2`](https://github.com/cloudflare/workers-sdk/commit/c3e410c2797f5c59b9ea0f63c20feef643366df2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - ci: bump undici versions to 5.28.2

## 1.1.0

### Minor Changes

- [#4779](https://github.com/cloudflare/workers-sdk/pull/4779) [`06bb99e1`](https://github.com/cloudflare/workers-sdk/commit/06bb99e1c91ffe5305343a17353912e734f5bd0c) Thanks [@1000hz](https://github.com/1000hz)! - Added a new `SelectRefreshablePrompt` component

  This component supports infinite scrolling, and the ability to refresh the items on 'R' keypress. See [#4310](https://github.com/cloudflare/workers-sdk/pull/4310) for more details.

* [#4779](https://github.com/cloudflare/workers-sdk/pull/4779) [`06bb99e1`](https://github.com/cloudflare/workers-sdk/commit/06bb99e1c91ffe5305343a17353912e734f5bd0c) Thanks [@1000hz](https://github.com/1000hz)! - Added `@clack/core`'s `MultiSelectPrompt` component

  See [#4310](https://github.com/cloudflare/workers-sdk/pull/4310) for more details.

- [#4779](https://github.com/cloudflare/workers-sdk/pull/4779) [`06bb99e1`](https://github.com/cloudflare/workers-sdk/commit/06bb99e1c91ffe5305343a17353912e734f5bd0c) Thanks [@1000hz](https://github.com/1000hz)! - Added `processArguments` helper function

  See [#4310](https://github.com/cloudflare/workers-sdk/pull/4310) for more details.

### Patch Changes

- [#4779](https://github.com/cloudflare/workers-sdk/pull/4779) [`06bb99e1`](https://github.com/cloudflare/workers-sdk/commit/06bb99e1c91ffe5305343a17353912e734f5bd0c) Thanks [@1000hz](https://github.com/1000hz)! - Downgraded `chalk` dependency from `^5.2.0` to `^2.4.2`

  This was done for compatibility reasons with the version used in the `wrangler` package. See [#4310](https://github.com/cloudflare/workers-sdk/pull/4310) for more details.

## 1.0.0

### Major Changes

- [#4189](https://github.com/cloudflare/workers-sdk/pull/4189) [`05798038`](https://github.com/cloudflare/workers-sdk/commit/05798038c85a83afb2c0e8ea9533c31a6fbe3e91) Thanks [@gabivlj](https://github.com/gabivlj)! - Move helper cli files of C3 into @cloudflare/cli and make Wrangler and C3 depend on it

### Patch Changes

- [#4271](https://github.com/cloudflare/workers-sdk/pull/4271) [`70016b2b`](https://github.com/cloudflare/workers-sdk/commit/70016b2bb514ea95f1ce0db3582e194c31df4c14) Thanks [@gabivlj](https://github.com/gabivlj)! - change backgrounds of statuses from red to more appropriate ones
