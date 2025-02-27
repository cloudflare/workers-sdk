# @cloudflare/vite-plugin

## 0.1.7

### Patch Changes

- [#8206](https://github.com/cloudflare/workers-sdk/pull/8206) [`477f8d9`](https://github.com/cloudflare/workers-sdk/commit/477f8d935baac1eca1545fed8585e5a09a28258f) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Add support for binding to named entrypoints in the same worker

- [#8266](https://github.com/cloudflare/workers-sdk/pull/8266) [`9f05e8f`](https://github.com/cloudflare/workers-sdk/commit/9f05e8fcfbf1308689a7c88c78f39a500b895857) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Make it possible to override `builder.buildApp` in the user config or prior plugins

- Updated dependencies []:
  - @cloudflare/unenv-preset@1.1.2

## 0.1.6

### Patch Changes

- Updated dependencies [[`a9a4c33`](https://github.com/cloudflare/workers-sdk/commit/a9a4c33143b9f58673ac0cdd251957997275fa10), [`6cae13a`](https://github.com/cloudflare/workers-sdk/commit/6cae13aa5f338cee18ec2e43a5dadda0c7d8dc2e)]:
  - miniflare@3.20250214.1
  - @cloudflare/unenv-preset@1.1.2

## 0.1.5

### Patch Changes

- [#8231](https://github.com/cloudflare/workers-sdk/pull/8231) [`51a2fd3`](https://github.com/cloudflare/workers-sdk/commit/51a2fd398b26bb922b798b3aa6a51e5457ab0273) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: use ESM WebSocketServer import to avoid crashing vite dev

  It appears that if there are multiple versions of the `ws` package in a user's project
  then the Node.js resolution picks up the ESM "import" package export rather than the "require" package export.
  This results in the entry-point having different JS exports:
  In particular the default export no longer contains a `Server` property; instead one must import the `WebSocketServer` named JS export.
  While it is not clear why the Node.js behaviour changes in this way, the cleanest fix is to import the `WebSocketServer` directly.

## 0.1.4

### Patch Changes

- [#8209](https://github.com/cloudflare/workers-sdk/pull/8209) [`1427535`](https://github.com/cloudflare/workers-sdk/commit/14275353664ab484014d421b4686e87c4eba72a0) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Fix bug with usage of Cloudflare builtins in dependencies. These are now externalized during dependency optimization.

- Updated dependencies []:
  - @cloudflare/unenv-preset@1.1.2

## 0.1.3

### Patch Changes

- [#8176](https://github.com/cloudflare/workers-sdk/pull/8176) [`693d63e`](https://github.com/cloudflare/workers-sdk/commit/693d63eda629400fffcb4de35da282c66bc2e645) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: refactor Node.js compat support to ensure all polyfills are pre-bundled before the first request

## 0.1.2

### Patch Changes

- Updated dependencies [[`5e06177`](https://github.com/cloudflare/workers-sdk/commit/5e06177861b29aa9b114f9ecb50093190af94f4b)]:
  - miniflare@3.20250214.0
  - @cloudflare/unenv-preset@1.1.2

## 0.1.1

### Patch Changes

- [#8118](https://github.com/cloudflare/workers-sdk/pull/8118) [`ca3cbc4`](https://github.com/cloudflare/workers-sdk/commit/ca3cbc42ad60c04148ea6c4cd3d2cc06c94b3814) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix Node.js compat module resolution

  In v0.0.8 we landed support for Vite 6.1 and also switched to using the new Cloudflare owned unenv preset.
  Unfortunately, the changes made in that update caused a regression in Node.js support.
  This became apparent only when the plugin was being used with certain package managers and outside of the workers-sdk monorepo.

  The unenv polyfills that get compiled into the Worker are transitive dependencies of this plugin, not direct dependencies of the user's application were the plugin is being used.
  This is on purpose to avoid the user having to install these dependencies themselves.

  Unfortunately, the changes in 0.0.8 did not correctly resolve the polyfills from `@cloudflare/unenv-preset` and `unenv` when the dependencies were not also installed directly into the user's application.

  The approach was incorrectly relying upon setting the `importer` in calls to Vite's `resolve(id, importer)` method to base the resolution in the context of the vite plugin package rather than the user's application.
  This doesn't work because the `importer` is only relevant when the `id` is relative, and not a bare module specifier in the case of the unenv polyfills.

  This change fixes how these id are resolved in the plugin by manually resolving the path at the appropriate point, while still leveraging Vite's resolution pipeline to handle aliasing, and dependency optimization.

  This change now introduces e2e tests that checks that isolated installations of the plugin works with npm, pnpm and yarn.

- Updated dependencies [[`28b1dc7`](https://github.com/cloudflare/workers-sdk/commit/28b1dc7c6f213de336d58ce93308575de8f42f06)]:
  - wrangler@3.109.1
  - @cloudflare/unenv-preset@1.1.2

## 0.1.0

### Minor Changes

- [#8080](https://github.com/cloudflare/workers-sdk/pull/8080) [`d0fda3d`](https://github.com/cloudflare/workers-sdk/commit/d0fda3df3fcc3e9607e1cbf5ddab83f40e517f09) Thanks [@jamesopstad](https://github.com/jamesopstad)! - No longer call `next` in server middleware.

  This is so that the Cloudflare plugin can override subsequent dev middleware for framework integrations.

### Patch Changes

- [#8079](https://github.com/cloudflare/workers-sdk/pull/8079) [`1b07419`](https://github.com/cloudflare/workers-sdk/commit/1b07419b5ac90657af1cc5fbcdfcc680021cfd73) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Call `writeDeployConfig` in `writeBundle` rather than `builder.buildApp`.

  The deploy config file is now written in the `writeBundle` hook rather than `builder.buildApp`. This ensures that the file is still written if other plugins override `builder` in the Vite config.

- Updated dependencies [[`3fb801f`](https://github.com/cloudflare/workers-sdk/commit/3fb801f734632c165685799cb1b752c4dad0445a), [`fff677e`](https://github.com/cloudflare/workers-sdk/commit/fff677e35f67c28275262c1d19f7eb4d6c6ab071), [`3fb801f`](https://github.com/cloudflare/workers-sdk/commit/3fb801f734632c165685799cb1b752c4dad0445a), [`542c6ea`](https://github.com/cloudflare/workers-sdk/commit/542c6ead5d7c7e64a103abd5572ec7b8aea96c90), [`3fb801f`](https://github.com/cloudflare/workers-sdk/commit/3fb801f734632c165685799cb1b752c4dad0445a), [`4db1fb5`](https://github.com/cloudflare/workers-sdk/commit/4db1fb5696412c6666589a778184e10386294d71), [`542c6ea`](https://github.com/cloudflare/workers-sdk/commit/542c6ead5d7c7e64a103abd5572ec7b8aea96c90), [`1bc60d7`](https://github.com/cloudflare/workers-sdk/commit/1bc60d761ebf67a64ac248e3e2c826407bc26252), [`1aa2a91`](https://github.com/cloudflare/workers-sdk/commit/1aa2a9198578f8eb106f19c8475a63ff4eef26aa), [`35710e5`](https://github.com/cloudflare/workers-sdk/commit/35710e590f20e5c83fb25138ba4ae7890b780a08)]:
  - wrangler@3.109.0
  - miniflare@3.20250204.1
  - @cloudflare/unenv-preset@1.1.2

## 0.0.8

### Patch Changes

- [#7830](https://github.com/cloudflare/workers-sdk/pull/7830) [`99ba292`](https://github.com/cloudflare/workers-sdk/commit/99ba292d8b21bb0aa005aa88c5dc968d0f089740) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - add support for Vite 6.1

- [#7830](https://github.com/cloudflare/workers-sdk/pull/7830) [`99ba292`](https://github.com/cloudflare/workers-sdk/commit/99ba292d8b21bb0aa005aa88c5dc968d0f089740) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - implement the new Cloudflare unenv preset into the Vite plugin

## 0.0.7

### Patch Changes

- [#8091](https://github.com/cloudflare/workers-sdk/pull/8091) [`9a3d525`](https://github.com/cloudflare/workers-sdk/commit/9a3d525717d26d0c40331327d0e8556a179944ff) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Omit files from public directory in Worker builds

- [#8083](https://github.com/cloudflare/workers-sdk/pull/8083) [`027698c`](https://github.com/cloudflare/workers-sdk/commit/027698c059a3df14c96bf63a20961b94187b543c) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Ensure the correct data types are sent in WebSocket messages from the client to the Worker

- [#8031](https://github.com/cloudflare/workers-sdk/pull/8031) [`07db54c`](https://github.com/cloudflare/workers-sdk/commit/07db54c21bfe0ac40364bd5c04e0d3597343b7a1) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Add support for Wasm (WebAssembly) modules.

- Updated dependencies [[`b1966df`](https://github.com/cloudflare/workers-sdk/commit/b1966dfe57713f3ddcaa781d0551a1088a22424e), [`c80dbd8`](https://github.com/cloudflare/workers-sdk/commit/c80dbd8d5e53a081cf600e250f1ddda860be1a12), [`1f80d69`](https://github.com/cloudflare/workers-sdk/commit/1f80d69f566d240428ddec0c7b62a23c6f5af3c1), [`88514c8`](https://github.com/cloudflare/workers-sdk/commit/88514c82d447903e48d9f782446a6b502e553631), [`9d08af8`](https://github.com/cloudflare/workers-sdk/commit/9d08af81893df499d914b890d784a9554ebf9507), [`6abe69c`](https://github.com/cloudflare/workers-sdk/commit/6abe69c3fe1fb2e762153a3094119ed83038a50b), [`0c0374c`](https://github.com/cloudflare/workers-sdk/commit/0c0374cce3908a47f7459ba4810855c1ce124349), [`b2dca9a`](https://github.com/cloudflare/workers-sdk/commit/b2dca9a2fb885cb4da87a959fefa035c0974d15c), [`6abe69c`](https://github.com/cloudflare/workers-sdk/commit/6abe69c3fe1fb2e762153a3094119ed83038a50b), [`c412a31`](https://github.com/cloudflare/workers-sdk/commit/c412a31985f3c622e5e3cf366699f9e6977184a2), [`60310cd`](https://github.com/cloudflare/workers-sdk/commit/60310cd796468e96571a4d0520f92af54da62630), [`71fd250`](https://github.com/cloudflare/workers-sdk/commit/71fd250f67a02feab7a2f66623ac8bd52b7f7f21)]:
  - wrangler@3.108.0
  - miniflare@3.20250204.0

## 0.0.6

### Patch Changes

- Updated dependencies [[`ab49886`](https://github.com/cloudflare/workers-sdk/commit/ab498862b96551774f601403d3e93d2105a18a91), [`e2b3306`](https://github.com/cloudflare/workers-sdk/commit/e2b3306e1721dbc0ba8e0eb2025a519b80adbd01)]:
  - miniflare@3.20250129.0
  - wrangler@3.107.1

## 0.0.5

### Patch Changes

- [#7864](https://github.com/cloudflare/workers-sdk/pull/7864) [`de6fa18`](https://github.com/cloudflare/workers-sdk/commit/de6fa1846ac793a86356a319a09482f08819b632) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Add full support for `.dev.vars` files.

  This change makes sure that `.dev.vars` files work when the environment is specified. It also
  copies the target `.dev.vars` file (which might be environment specific, e.g. `.dev.vars.prod`)
  to the worker's dist directory so that `vite preview` can pick it up.
  The copied file will always be named `.dev.vars`.

- Updated dependencies [[`d758215`](https://github.com/cloudflare/workers-sdk/commit/d7582150a5dc6568ac1d1ebcdf24667c83c6a5eb), [`34f9797`](https://github.com/cloudflare/workers-sdk/commit/34f9797822836b98edc4d8ddc6e2fb0ab322b864), [`f57bc4e`](https://github.com/cloudflare/workers-sdk/commit/f57bc4e059b19334783f8f8f7d46c5a710a589ae), [`cf4f47a`](https://github.com/cloudflare/workers-sdk/commit/cf4f47a8af2dc476f8a0e61f0d22f080f191de1f), [`38db4ed`](https://github.com/cloudflare/workers-sdk/commit/38db4ed4de3bed0b4c33d23ee035882a71fbb26b), [`de6fa18`](https://github.com/cloudflare/workers-sdk/commit/de6fa1846ac793a86356a319a09482f08819b632), [`bc4d6c8`](https://github.com/cloudflare/workers-sdk/commit/bc4d6c8d25f40308231e9109dc643df68bc72b52)]:
  - wrangler@3.107.0
  - miniflare@3.20250124.1

## 0.0.4

### Patch Changes

- [#7909](https://github.com/cloudflare/workers-sdk/pull/7909) [`0b79cec`](https://github.com/cloudflare/workers-sdk/commit/0b79cec51760a5b928b51d4140e6797eaac4644b) Thanks [@byule](https://github.com/byule)! - Support unsafe params

- Updated dependencies [[`50b13f6`](https://github.com/cloudflare/workers-sdk/commit/50b13f60af0eac176a000caf7cc799b21fe3f3c5), [`134d61d`](https://github.com/cloudflare/workers-sdk/commit/134d61d97bb96337220e530f4af2ec2c8236f383), [`5c02e46`](https://github.com/cloudflare/workers-sdk/commit/5c02e46c89cce24d81d696173b0e52ce04a8ba59), [`2b6f149`](https://github.com/cloudflare/workers-sdk/commit/2b6f1496685b23b6734c3001db49d3086005582e), [`bd9228e`](https://github.com/cloudflare/workers-sdk/commit/bd9228e855c25b2f5d94e298d6d1128484019f83), [`13ab591`](https://github.com/cloudflare/workers-sdk/commit/13ab5916058e8e834f3e13fb9b5b9d9addc0f930)]:
  - wrangler@3.106.0
  - miniflare@3.20250124.0

## 0.0.3

### Patch Changes

- Updated dependencies [[`fd5a455`](https://github.com/cloudflare/workers-sdk/commit/fd5a45520e92e0fe60c457a6ae54caef67d7bbcf), [`40f89a9`](https://github.com/cloudflare/workers-sdk/commit/40f89a90d93f57294e49a6b5ed8ba8cc38e0da77), [`7d138d9`](https://github.com/cloudflare/workers-sdk/commit/7d138d92c3cbfb84bccb84a3e93f41ad5549d604)]:
  - wrangler@3.105.1
  - miniflare@3.20250124.0

## 0.0.2

### Patch Changes

- [#7846](https://github.com/cloudflare/workers-sdk/pull/7846) [`cd31971`](https://github.com/cloudflare/workers-sdk/commit/cd319710a741185d0a5f03f2a26a352b7254cc00) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make sure that runner initialization is properly validated

- Updated dependencies [[`e5ebdb1`](https://github.com/cloudflare/workers-sdk/commit/e5ebdb143788728d8b364fcafc0b36bda4ceb625), [`bdc7958`](https://github.com/cloudflare/workers-sdk/commit/bdc7958f22bbbb9ce2608fefd295054121a92441), [`78a9a2d`](https://github.com/cloudflare/workers-sdk/commit/78a9a2db485fefb0038ea9d97cc547a9218b7afa)]:
  - wrangler@3.105.0
  - miniflare@3.20241230.2

## 0.0.1

### Patch Changes

- [#7763](https://github.com/cloudflare/workers-sdk/pull/7763) [`7e04493`](https://github.com/cloudflare/workers-sdk/commit/7e0449340caba36b8db0e8121623bf286acacd3b) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Initial beta release of the Cloudflare Vite plugin

- Updated dependencies [[`cccfe51`](https://github.com/cloudflare/workers-sdk/commit/cccfe51ca6a18a2a69bb6c7fa7066c92c9d704af), [`fcaa02c`](https://github.com/cloudflare/workers-sdk/commit/fcaa02cdf4f3f648d7218e8f7fb411a2324eebb5), [`26fa9e8`](https://github.com/cloudflare/workers-sdk/commit/26fa9e80279401ba5eea4e1522597953441402f2), [`97d2a1b`](https://github.com/cloudflare/workers-sdk/commit/97d2a1bb56ea0bb94531f9c41b737ba43ed5996f), [`d7adb50`](https://github.com/cloudflare/workers-sdk/commit/d7adb50fcc9e3c509365fed8a86df485ea9f739b), [`f6cc029`](https://github.com/cloudflare/workers-sdk/commit/f6cc0293d3a6bf45a323b6d9718b7162149cc84f), [`9077a67`](https://github.com/cloudflare/workers-sdk/commit/9077a6748a30d5f24c9b7cbdc3a6514fec5aa66c)]:
  - wrangler@3.104.0
  - miniflare@3.20241230.2
