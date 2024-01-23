# @cloudflare/cli

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
