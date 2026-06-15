# @cloudflare/deploy-helpers

## 0.1.3

### Patch Changes

- [#14259](https://github.com/cloudflare/workers-sdk/pull/14259) [`2ae6099`](https://github.com/cloudflare/workers-sdk/commit/2ae6099db77c076fb7e6e782d2f0ebd7ba86dbbb) Thanks [@emily-shen](https://github.com/emily-shen)! - Move worker build step earlier in deploy/upload step, before upload specific config validation

- Updated dependencies [[`f3990b2`](https://github.com/cloudflare/workers-sdk/commit/f3990b2358ef49cd6e1ab16de27e25dcd949896f), [`4597f08`](https://github.com/cloudflare/workers-sdk/commit/4597f085d25c7d066ecf056de313e194f41094d1), [`2047a32`](https://github.com/cloudflare/workers-sdk/commit/2047a32cf78886b71b794a3dfac946a146ab3ffe)]:
  - miniflare@4.20260611.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`c6c61b5`](https://github.com/cloudflare/workers-sdk/commit/c6c61b59431443b2bcda25f3af7624dd2ce19b9b), [`b502d54`](https://github.com/cloudflare/workers-sdk/commit/b502d5445b9e9e030020a3d65c0334507393aa64), [`c4f45e8`](https://github.com/cloudflare/workers-sdk/commit/c4f45e8b8694c60fb1808f7fbb130e4b4893d20c)]:
  - @cloudflare/workers-utils@0.23.0

## 0.1.1

### Patch Changes

- [#14063](https://github.com/cloudflare/workers-sdk/pull/14063) [`65b5f9e`](https://github.com/cloudflare/workers-sdk/commit/65b5f9e1855651c2df2c1bdfc8930141e36413d5) Thanks [@emily-shen](https://github.com/emily-shen)! - Move fetch helpers into `@cloudflare/workers-utils`

  Shared Cloudflare API fetch helper types and plumbing now live in `@cloudflare/workers-utils` so Wrangler and other clients can use the same implementation.

## 0.1.0

### Minor Changes

- [#14014](https://github.com/cloudflare/workers-sdk/pull/14014) [`d042705`](https://github.com/cloudflare/workers-sdk/commit/d042705c7a8715184e6e16d399c17adb958d0e80) Thanks [@emily-shen](https://github.com/emily-shen)! - Add `@cloudflare/deploy-helpers` package.

  This introduces a shared internal package for deploy-related helper types and code.
