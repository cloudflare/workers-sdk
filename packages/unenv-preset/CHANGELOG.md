# @cloudflare/unenv-preset

## 1.1.1

### Patch Changes

- [#7939](https://github.com/cloudflare/workers-sdk/pull/7939) [`17ce7f5`](https://github.com/cloudflare/workers-sdk/commit/17ce7f5661d6db913a3fd35a636b34988b22b131) Thanks [@anonrig](https://github.com/anonrig)! - Remove `clearImmediate()` and `setImmediate()` injects

  These globals are now available in workerd (as of [v1.20240815 - cloudflare/workerd@f07cd8e](https://github.com/cloudflare/workerd/commit/f07cd8e40f53f1607fb1502916a7fe1f9f2b2862)).

## 1.1.0

### Minor Changes

- [#7853](https://github.com/cloudflare/workers-sdk/pull/7853) [`061587d`](https://github.com/cloudflare/workers-sdk/commit/061587d81deaa5274f04fa0a39f1c8373b828a42) Thanks [@anonrig](https://github.com/anonrig)! - Use the workerd implementation for Node `net`, `timers`, and `timers/promises` modules

  - drop the polyfills
  - update `unenv` to 2.0.0-rc.1

## 1.0.2

### Patch Changes

- [#7806](https://github.com/cloudflare/workers-sdk/pull/7806) [`d7adb50`](https://github.com/cloudflare/workers-sdk/commit/d7adb50fcc9e3c509365fed8a86df485ea9f739b) Thanks [@vicb](https://github.com/vicb)! - chore: update unenv to 2.0.0-rc.0

  Pull a couple changes in node:timers

  - unjs/unenv#384 fix function bindings in node:timer
  - unjs/unenv#385 implement active and \_unrefActive in node:timer

  The unenv update also includes #unjs/unenv/381 which implements
  `stdout`, `stderr` and `stdin` of `node:process` with `node:tty`

## 1.0.1

### Patch Changes

- [#7789](https://github.com/cloudflare/workers-sdk/pull/7789) [`facb3ff`](https://github.com/cloudflare/workers-sdk/commit/facb3ffc9b1973b16b8c3d30de790505c03e1554) Thanks [@vicb](https://github.com/vicb)! - refactor(unenv-preset): misc minor changes

  - Bump the Typescript dependency to ^5.7.3 as required by unbuild
  - Install a local version of `@types/node` (`@types/node-unenv`)
  - Add more details to the README

## 1.0.0

### Major Changes

- Initial release of the Cloudflare unenv preset for Workers

### Patch Changes

- [#7760](https://github.com/cloudflare/workers-sdk/pull/7760) [`19228e5`](https://github.com/cloudflare/workers-sdk/commit/19228e50f3bd7ed5d32f8132bd02abc9999585ea) Thanks [@vicb](https://github.com/vicb)! - chore: update unenv dependency version

## 0.1.1

### Patch Changes

- [#7721](https://github.com/cloudflare/workers-sdk/pull/7721) [`5c2c55a`](https://github.com/cloudflare/workers-sdk/commit/5c2c55a2b79863cedf701f9b7e49439ca7d70cea) Thanks [@vicb](https://github.com/vicb)! - chore(unenv-preset): Add .cjs output for the preset

## 0.1.0

### Minor Changes

- [#7697](https://github.com/cloudflare/workers-sdk/pull/7697) [`3e2bede`](https://github.com/cloudflare/workers-sdk/commit/3e2bedecee3dc856f334ccc7feb47d52c1fb05cc) Thanks [@vicb](https://github.com/vicb)! - chore(unenv-preset): drop unused .cjs files

  Only .mjs files are used.
