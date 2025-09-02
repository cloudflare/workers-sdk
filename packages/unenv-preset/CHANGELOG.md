# @cloudflare/unenv-preset

## 2.7.1

### Patch Changes

- [#10514](https://github.com/cloudflare/workers-sdk/pull/10514) [`31ecfeb`](https://github.com/cloudflare/workers-sdk/commit/31ecfeb18b3419044474e37a2a6dab9bf35ff574) Thanks [@vicb](https://github.com/vicb)! - Use the native `node:constants` module

  The native `node:constants` module was implemented in [this PR](https://github.com/cloudflare/workerd/pull/4759)
  It was released as part of workerd [1.20250813.0](https://github.com/cloudflare/workerd/releases/tag/v1.20250813.0)

- [#10431](https://github.com/cloudflare/workers-sdk/pull/10431) [`f656d1a`](https://github.com/cloudflare/workers-sdk/commit/f656d1a2da772692b09e8f3ae1e0805d1d33f52e) Thanks [@anonrig](https://github.com/anonrig)! - Remove node:module polyfills

- [#10443](https://github.com/cloudflare/workers-sdk/pull/10443) [`bd21fc5`](https://github.com/cloudflare/workers-sdk/commit/bd21fc51da3c2174919921b80c378bf294ebc680) Thanks [@anonrig](https://github.com/anonrig)! - Removes node:crypto polyfills

- [#10498](https://github.com/cloudflare/workers-sdk/pull/10498) [`4851955`](https://github.com/cloudflare/workers-sdk/commit/4851955c2b87763004b4eb0353a2b65e590993e4) Thanks [@vicb](https://github.com/vicb)! - enabled native `node:fs` and `node:os` modules.

  native `node:fs` is used when the `enable_nodejs_fs_module` is set or by default starting from 2025-09-15.

  native `node:os` is used when the `enable_nodejs_os_module` is set or by default starting from 2025-09-15

## 2.7.0

### Minor Changes

- [#10224](https://github.com/cloudflare/workers-sdk/pull/10224) [`7c339ae`](https://github.com/cloudflare/workers-sdk/commit/7c339aeb0392e41b9a306c84538950f32c9a0dd4) Thanks [@vicb](https://github.com/vicb)! - add support for native `node:fs` and `node:fs/promises`.

### Patch Changes

- [#10463](https://github.com/cloudflare/workers-sdk/pull/10463) [`76d9aa2`](https://github.com/cloudflare/workers-sdk/commit/76d9aa2335cb52aec3e4a86195b40002ff538022) Thanks [@vicb](https://github.com/vicb)! - Remove experimental from the `enable_nodejs_http_server_modules` flag

  See [`node:http`](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/) and [`node:https`](https://developers.cloudflare.com/workers/runtime-apis/nodejs/https/) for details.

## 2.6.3

### Patch Changes

- [#10432](https://github.com/cloudflare/workers-sdk/pull/10432) [`19e2aab`](https://github.com/cloudflare/workers-sdk/commit/19e2aab1d68594c7289d0aa16474544919fd5b9b) Thanks [@anonrig](https://github.com/anonrig)! - Remove "node:tls" polyfill

## 2.6.2

### Patch Changes

- [#10374](https://github.com/cloudflare/workers-sdk/pull/10374) [`20520fa`](https://github.com/cloudflare/workers-sdk/commit/20520faa340005b9713007ccb8480fb6e97028d3) Thanks [@edmundhung](https://github.com/edmundhung)! - Simplify debug package resolution with nodejs_compat

  A patched version of `debug` was previously introduced that resolved the package to a custom implementation. However, this caused issues due to CJS/ESM interop problems. We now resolve the `debug` package to use the Node.js implementation instead.

## 2.6.1

### Patch Changes

- [#10243](https://github.com/cloudflare/workers-sdk/pull/10243) [`d481901`](https://github.com/cloudflare/workers-sdk/commit/d48190127fbb564c5abdd3c8f33433a6381d8899) Thanks [@devin-ai-integration](https://github.com/apps/devin-ai-integration)! - Remove async_hooks polyfill - now uses native workerd implementation

  The async_hooks module is now provided natively by workerd, making the polyfill unnecessary. This improves performance and ensures better compatibility with Node.js async_hooks APIs.

## 2.6.0

### Minor Changes

- [#10208](https://github.com/cloudflare/workers-sdk/pull/10208) [`6b9cd5b`](https://github.com/cloudflare/workers-sdk/commit/6b9cd5b18775446760e938a10bf8ca1cfbb8c96f) Thanks [@vicb](https://github.com/vicb)! - add support for native `node:os`

- [#10205](https://github.com/cloudflare/workers-sdk/pull/10205) [`7e204a9`](https://github.com/cloudflare/workers-sdk/commit/7e204a941e4e907b690f2ad6ff3cb10f2d2f20bd) Thanks [@vicb](https://github.com/vicb)! - Add support for http and https server APIs

### Patch Changes

- [#10150](https://github.com/cloudflare/workers-sdk/pull/10150) [`3f83ac1`](https://github.com/cloudflare/workers-sdk/commit/3f83ac1d8b67c07a0c7d08961b8a81a830543853) Thanks [@vicb](https://github.com/vicb)! - Refactor http overrides

## 2.5.0

### Minor Changes

- [#10048](https://github.com/cloudflare/workers-sdk/pull/10048) [`dbdbb8c`](https://github.com/cloudflare/workers-sdk/commit/dbdbb8c41ea5612f9e79bde5cfd0192c70025ee7) Thanks [@vicb](https://github.com/vicb)! - pass the compatibility date and flags to the unenv preset

- [#10078](https://github.com/cloudflare/workers-sdk/pull/10078) [`5991a9c`](https://github.com/cloudflare/workers-sdk/commit/5991a9cb009fa3c24d848467397ceabe23e7c90a) Thanks [@vicb](https://github.com/vicb)! - add support for the native http modules

### Patch Changes

- [#10096](https://github.com/cloudflare/workers-sdk/pull/10096) [`687655f`](https://github.com/cloudflare/workers-sdk/commit/687655f8d399140e7b8d61c1fc04140e7455344a) Thanks [@vicb](https://github.com/vicb)! - bump unenv to 2.0.0-rc.19

## 2.4.1

### Patch Changes

- [#10031](https://github.com/cloudflare/workers-sdk/pull/10031) [`823cba8`](https://github.com/cloudflare/workers-sdk/commit/823cba8e51fa6840f50dd949bcfa967ff6fefc37) Thanks [@vicb](https://github.com/vicb)! - wrangler and vite-plugin now depend upon the latest version of unenv-preset

## 2.4.0

### Minor Changes

- [#10014](https://github.com/cloudflare/workers-sdk/pull/10014) [`189fe23`](https://github.com/cloudflare/workers-sdk/commit/189fe23830373e75c881481939665384c18246dc) Thanks [@edmundhung](https://github.com/edmundhung)! - Shim `debug` npm package with patched version for cloudflare env support

## 2.3.3

### Patch Changes

- [#9483](https://github.com/cloudflare/workers-sdk/pull/9483) [`3261957`](https://github.com/cloudflare/workers-sdk/commit/3261957aba6bd8c02014206ad6fa219badde4a35) Thanks [@vicb](https://github.com/vicb)! - Use crypto.constants from workerd

## 2.3.2

### Patch Changes

- [#9220](https://github.com/cloudflare/workers-sdk/pull/9220) [`f61a08e`](https://github.com/cloudflare/workers-sdk/commit/f61a08e311a5aa6b24d56f1901d7fb17b16377b0) Thanks [@vicb](https://github.com/vicb)! - Sync unenv-preset with workerd

- [#9219](https://github.com/cloudflare/workers-sdk/pull/9219) [`ea71df3`](https://github.com/cloudflare/workers-sdk/commit/ea71df3d485cfb37b4585b157ae6b95933b0335f) Thanks [@vicb](https://github.com/vicb)! - bump unenv to 2.0.0-rc.17

## 2.3.1

### Patch Changes

- [#8638](https://github.com/cloudflare/workers-sdk/pull/8638) [`29cb306`](https://github.com/cloudflare/workers-sdk/commit/29cb3069c9bae79941247dc2fd71021f1c75887d) Thanks [@vicb](https://github.com/vicb)! - Use native APIs in `node:tls`

  Uses `checkServerIdentity`, `createSecureContext`, and `SecureContext` from workerd rather than the unenv polyfill.

## 2.3.0

### Minor Changes

- [#8568](https://github.com/cloudflare/workers-sdk/pull/8568) [`a7bd79b`](https://github.com/cloudflare/workers-sdk/commit/a7bd79bf40afe7079cd94557482bd909d825af09) Thanks [@vicb](https://github.com/vicb)! - Use the native implementation of crypto APIs

## 2.2.0

### Minor Changes

- [#8514](https://github.com/cloudflare/workers-sdk/pull/8514) [`4ad78ea`](https://github.com/cloudflare/workers-sdk/commit/4ad78ea2c9b8fed7e3afe581e1c320b852969f6a) Thanks [@vicb](https://github.com/vicb)! - Use the native implementation for `connect` and `TLSSocket` from `node:tls`

## 2.1.0

### Minor Changes

- [#8514](https://github.com/cloudflare/workers-sdk/pull/8514) [`4ad78ea`](https://github.com/cloudflare/workers-sdk/commit/4ad78ea2c9b8fed7e3afe581e1c320b852969f6a) Thanks [@vicb](https://github.com/vicb)! - Use the native implementation for `connect` and `TLSSocket` from `node:tls`

### Patch Changes

- [#8514](https://github.com/cloudflare/workers-sdk/pull/8514) [`4ad78ea`](https://github.com/cloudflare/workers-sdk/commit/4ad78ea2c9b8fed7e3afe581e1c320b852969f6a) Thanks [@vicb](https://github.com/vicb)! - sync with `unenv@2.0.0-rc.15`

## 2.0.2

### Patch Changes

- Fixes outdated dist files in the 2.0.1 release

## 2.0.1

### Patch Changes

- Sync with `unenv@2.0.0-rc.14`

## 2.0.0

### Major Changes

- [#8322](https://github.com/cloudflare/workers-sdk/pull/8322) [`ff96a70`](https://github.com/cloudflare/workers-sdk/commit/ff96a7091439a4645772778295fd373f1a51718b) Thanks [@vicb](https://github.com/vicb)! - Sync the cloudflare preset with `unenv@2.0.0-rc.8`

  - The preset is now delivered as ESM only
  - A polyfill is added for perf_hooks

## 1.1.2

### Patch Changes

- [#7998](https://github.com/cloudflare/workers-sdk/pull/7998) [`576d931`](https://github.com/cloudflare/workers-sdk/commit/576d931d1a1ac59fb777966d3bddd4a4ce9acd92) Thanks [@vicb](https://github.com/vicb)! - Use builtin implementation for isArray and isDeepStrictEqual

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
