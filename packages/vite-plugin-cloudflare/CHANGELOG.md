# @cloudflare/vite-plugin

## 0.1.15

### Patch Changes

- [#8556](https://github.com/cloudflare/workers-sdk/pull/8556) [`b7d6b7d`](https://github.com/cloudflare/workers-sdk/commit/b7d6b7dd1fbbaecd4f595d2d4249ab902b726538) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Add support for `assets_navigation_prefer_asset_serving` in Vite (`dev` and `preview`)

- [#8608](https://github.com/cloudflare/workers-sdk/pull/8608) [`dee6068`](https://github.com/cloudflare/workers-sdk/commit/dee6068af62f0d84c6f882a9102197ff9ce5f515) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - export `PluginConfig` type

- [#8507](https://github.com/cloudflare/workers-sdk/pull/8507) [`57ddaac`](https://github.com/cloudflare/workers-sdk/commit/57ddaacde4e9c91859179df68b1e7dbb36fe2d2b) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make sure that internal variables are not exposed in the importable `env` object

- Updated dependencies [[`d8f1c49`](https://github.com/cloudflare/workers-sdk/commit/d8f1c49541229f4b41bd16bbebda3017a5d17d64), [`b7d6b7d`](https://github.com/cloudflare/workers-sdk/commit/b7d6b7dd1fbbaecd4f595d2d4249ab902b726538), [`4a5f270`](https://github.com/cloudflare/workers-sdk/commit/4a5f270129f4a2d8995ba2fdd7fc220ee7c75300), [`5f151fc`](https://github.com/cloudflare/workers-sdk/commit/5f151fc93bfcc87f9a6aa2a33cd67901e3507365), [`5d78760`](https://github.com/cloudflare/workers-sdk/commit/5d78760af7adbb57416d73f102123152d37bec53), [`0d1240b`](https://github.com/cloudflare/workers-sdk/commit/0d1240becf3c08094b39e215de6d730f0d25de6b), [`c0d0cd0`](https://github.com/cloudflare/workers-sdk/commit/c0d0cd03a5eede7ec4f8a615f2c4b1f9a73dfcee), [`1c94eee`](https://github.com/cloudflare/workers-sdk/commit/1c94eee008a8281e84171ef1edee74d965b90c33)]:
  - miniflare@4.20250320.0
  - wrangler@4.4.0
  - @cloudflare/unenv-preset@2.3.0

## 0.1.14

### Patch Changes

- [#8365](https://github.com/cloudflare/workers-sdk/pull/8365) [`f3db430`](https://github.com/cloudflare/workers-sdk/commit/f3db4306f86c817f8cbec8d7dbb21fc08107aa55) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - update vite-plugin to use the latest unenv-preset

- [#8489](https://github.com/cloudflare/workers-sdk/pull/8489) [`37adc1d`](https://github.com/cloudflare/workers-sdk/commit/37adc1dbd233e083469422c4958f6ec5b932bff1) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make sure `process.env` is populated when the `nodejs_compat_populate_process_env` flag is set

- [#8587](https://github.com/cloudflare/workers-sdk/pull/8587) [`18fa891`](https://github.com/cloudflare/workers-sdk/commit/18fa89131d97683d43765b1ffbd31c9ff7c40f93) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Add support for `.wasm?init` extension to load WebAssembly as documented by Vite (https://vite.dev/guide/features.html#webassembly).

- [#8441](https://github.com/cloudflare/workers-sdk/pull/8441) [`257e7f9`](https://github.com/cloudflare/workers-sdk/commit/257e7f9485d22de2bab97f2dba22f495d6c7b11f) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add `inspectorPort` option to plugin config

  add an `inspectorPort` option that allows developers to start a devTools inspector server to debug their workers (defaulting to `9229`)

- [#8545](https://github.com/cloudflare/workers-sdk/pull/8545) [`aadb49c`](https://github.com/cloudflare/workers-sdk/commit/aadb49c5cda8f99863af0ada5889ef32aaa10ef9) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Make `assets` field optional in the Worker config when using assets. At build time, assets are included if there is a client build.

- [#8441](https://github.com/cloudflare/workers-sdk/pull/8441) [`257e7f9`](https://github.com/cloudflare/workers-sdk/commit/257e7f9485d22de2bab97f2dba22f495d6c7b11f) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add `/__debug` path for better debugging

  add a new `/__debug` path that users can navigate to in order to debug their workers

- [#8387](https://github.com/cloudflare/workers-sdk/pull/8387) [`dbbeb23`](https://github.com/cloudflare/workers-sdk/commit/dbbeb23c71215894c6ee14eb1a6fd01030f9212c) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Support Text and Data module types.
  Text modules can be imported with a `.txt` or `.html` extension while Data modules can be imported with a `.bin` extension.
  This expands on the existing support for WebAssembly modules, which can now be imported with `.wasm` or `.wasm?module` extensions.
  Custom rules are not supported.
  More info on including non-JavaScript modules can be found [here](https://developers.cloudflare.com/workers/wrangler/bundling/#including-non-javascript-modules).
- Updated dependencies [[`9adbd50`](https://github.com/cloudflare/workers-sdk/commit/9adbd50cf1cbe841f8885de1d1d22b084fcfd987), [`dae7bd4`](https://github.com/cloudflare/workers-sdk/commit/dae7bd4dd0b97956d868799e6a01fe8b47a7250a), [`383dc0a`](https://github.com/cloudflare/workers-sdk/commit/383dc0abd5c883b3c39ece1abb1f332d1f63a0bb), [`c4fa349`](https://github.com/cloudflare/workers-sdk/commit/c4fa349da3667be6c2ba0d96031b69e4674edbd8), [`8278db5`](https://github.com/cloudflare/workers-sdk/commit/8278db5c862f51032ef7a2f79770f329c7f9dd9b), [`86ab0ca`](https://github.com/cloudflare/workers-sdk/commit/86ab0ca52ab878a5c01900218e91261ac09f5438), [`a25f060`](https://github.com/cloudflare/workers-sdk/commit/a25f060232bfbfb30aede6a891b665f0450770bf), [`a7bd79b`](https://github.com/cloudflare/workers-sdk/commit/a7bd79bf40afe7079cd94557482bd909d825af09), [`62d5471`](https://github.com/cloudflare/workers-sdk/commit/62d5471eae9b5ed8cb31f025fa23ba3930b94317), [`2a43cdc`](https://github.com/cloudflare/workers-sdk/commit/2a43cdcf7218bd840737790707e07cbb25baa8ea), [`5ae12a9`](https://github.com/cloudflare/workers-sdk/commit/5ae12a9390f81a3e1df2eb3da4a34dc143879a3c), [`29015e5`](https://github.com/cloudflare/workers-sdk/commit/29015e5577ad8b063b93425da5e80d5054add728)]:
  - miniflare@4.20250319.0
  - wrangler@4.3.0
  - @cloudflare/unenv-preset@2.3.0

## 0.1.13

### Patch Changes

- [#8505](https://github.com/cloudflare/workers-sdk/pull/8505) [`03435cc`](https://github.com/cloudflare/workers-sdk/commit/03435cc17efdf1e2942fb244c47fbcb7710205da) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Support Wrangler v4 as peer dependency.

- [#8523](https://github.com/cloudflare/workers-sdk/pull/8523) [`c7f86cb`](https://github.com/cloudflare/workers-sdk/commit/c7f86cbdfcd6d630425d96b2eeddcf4ed4093767) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add validation for the Wrangler config `main` field

- [#8515](https://github.com/cloudflare/workers-sdk/pull/8515) [`3d69e52`](https://github.com/cloudflare/workers-sdk/commit/3d69e5205c5a71ace30c83eb94d006e19d342ed2) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Set `target` in `optimizeDeps.esbuildOptions` to `es2022`. This fixes a bug where the target for prebundled dependencies did not match the build target.

- Updated dependencies [[`14680b9`](https://github.com/cloudflare/workers-sdk/commit/14680b90a23463d4592511ba4e02d38c30c1d2ea), [`fd9dff8`](https://github.com/cloudflare/workers-sdk/commit/fd9dff833870b768af34b391bb109782d86908bb), [`ff26dc2`](https://github.com/cloudflare/workers-sdk/commit/ff26dc20210c193b9e175f5567277d5584bdf657), [`05973bb`](https://github.com/cloudflare/workers-sdk/commit/05973bba4ca49e0fad43e6094ddea67cdf67dc42), [`4ad78ea`](https://github.com/cloudflare/workers-sdk/commit/4ad78ea2c9b8fed7e3afe581e1c320b852969f6a)]:
  - wrangler@4.2.0
  - miniflare@4.20250317.1
  - @cloudflare/unenv-preset@2.2.0

## 0.1.12

### Patch Changes

- Updated dependencies [[`b8fd1b1`](https://github.com/cloudflare/workers-sdk/commit/b8fd1b1c8be1d84a0b3be5f27f7c91f88d9473d2), [`4978e5b`](https://github.com/cloudflare/workers-sdk/commit/4978e5bebb081a5ff6901d0b1bb807d51c3db30b), [`5ae180e`](https://github.com/cloudflare/workers-sdk/commit/5ae180ee8acfc03b46bc3e836f5ce3856c458af8), [`74b0c73`](https://github.com/cloudflare/workers-sdk/commit/74b0c7377a643241d4e3efa674cd644f8f5b8e10), [`931b53d`](https://github.com/cloudflare/workers-sdk/commit/931b53d708b0369de97475a9f427bcb922795378), [`edf169d`](https://github.com/cloudflare/workers-sdk/commit/edf169d15062a31dec1d32427fb72438425b45bf), [`1b2aa91`](https://github.com/cloudflare/workers-sdk/commit/1b2aa916fecb010dd250de3b2bbdd527bed992ef)]:
  - wrangler@4.1.0
  - miniflare@4.20250317.0
  - @cloudflare/unenv-preset@2.0.2

## 0.1.11

### Patch Changes

- Updated dependencies [[`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f)]:
  - wrangler@4.0.0
  - miniflare@4.20250310.0
  - @cloudflare/unenv-preset@2.0.2

## 0.1.10

### Patch Changes

- [#8273](https://github.com/cloudflare/workers-sdk/pull/8273) [`e3efd68`](https://github.com/cloudflare/workers-sdk/commit/e3efd68e3989815f6935fa4315e0aa23aaac11c9) Thanks [@penalosa](https://github.com/penalosa)! - Support AI, Vectorize, and Images bindings when using `@cloudflare/vite-plugin`

- Updated dependencies [[`8d6d722`](https://github.com/cloudflare/workers-sdk/commit/8d6d7224bcebe04691478e2c5261c00992a1747a), [`8242e07`](https://github.com/cloudflare/workers-sdk/commit/8242e07447f47ab764655e8ec9a046b1fe9ea279), [`e3efd68`](https://github.com/cloudflare/workers-sdk/commit/e3efd68e3989815f6935fa4315e0aa23aaac11c9), [`a352798`](https://github.com/cloudflare/workers-sdk/commit/a3527988e8849eab92b66cfb3a30334bef706b34), [`53e6323`](https://github.com/cloudflare/workers-sdk/commit/53e63233c5b9bb786af3daea63c10ffe60a5d881), [`4d9d9e6`](https://github.com/cloudflare/workers-sdk/commit/4d9d9e6c830b32a0e9948ace32e20a1cdac3a53b)]:
  - wrangler@3.114.1
  - miniflare@3.20250310.0
  - @cloudflare/unenv-preset@2.0.2

## 0.1.9

### Patch Changes

- [#8356](https://github.com/cloudflare/workers-sdk/pull/8356) [`d1d5b53`](https://github.com/cloudflare/workers-sdk/commit/d1d5b5313a60713c84f212edd7f1c7fe32e3e593) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Support dynamic import paths in preview mode.

- Updated dependencies [[`2d40989`](https://github.com/cloudflare/workers-sdk/commit/2d409892f1cf08f07f84d25dcab023bc20ada374), [`da568e5`](https://github.com/cloudflare/workers-sdk/commit/da568e5a94bf270cfdcd80123d8161fc5437dcd2), [`cf14e17`](https://github.com/cloudflare/workers-sdk/commit/cf14e17d40b9e51475ba4d9ee6b4e3ef5ae5e841), [`79c7810`](https://github.com/cloudflare/workers-sdk/commit/79c781076cc79e512753b65644c027138aa1d878)]:
  - miniflare@3.20250224.0
  - @cloudflare/unenv-preset@2.0.0

## 0.1.8

### Patch Changes

- [#8320](https://github.com/cloudflare/workers-sdk/pull/8320) [`c8fab4d`](https://github.com/cloudflare/workers-sdk/commit/c8fab4d93ed044e7d217a876b1c5b0dcb329428c) Thanks [@threepointone](https://github.com/threepointone)! - chore: tweak a couple of error messages in the vite plugin

  I was seeing an error like this: `Unexpected error: no match for module path.`. But it wasn't telling me what the path was. On debugging I noticed that it was telling me about the module "path"! Which meant I needed to enable node_compat. This patch just makes the messaging a little clearer.

  (Ideally we'd spot that it was a node builtin and recommend turning on node_compat, but I'll leave that to you folks.)

- Updated dependencies [[`fce642d`](https://github.com/cloudflare/workers-sdk/commit/fce642d59264b1b6e7df8a6c9a015519b7574637), [`ff96a70`](https://github.com/cloudflare/workers-sdk/commit/ff96a7091439a4645772778295fd373f1a51718b), [`a4909cb`](https://github.com/cloudflare/workers-sdk/commit/a4909cbe552eae72b901cd78bf1f814f818085a0)]:
  - miniflare@3.20250214.2
  - @cloudflare/unenv-preset@2.0.0

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
