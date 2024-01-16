# @cloudflare/pages-shared

## 0.11.7

### Patch Changes

- Updated dependencies [[`4f6999ea`](https://github.com/cloudflare/workers-sdk/commit/4f6999eacd591d0d65180f805f2abc3c8a2c06c4), [`c37d94b5`](https://github.com/cloudflare/workers-sdk/commit/c37d94b51f4d5517c244f8a4178be6a266d2362e)]:
  - miniflare@3.20231218.2

## 0.11.6

### Patch Changes

- Updated dependencies [[`037de5ec`](https://github.com/cloudflare/workers-sdk/commit/037de5ec77efc8261860c6d625bc90cd1f2fdd41)]:
  - miniflare@3.20231218.1

## 0.11.5

### Patch Changes

- Updated dependencies [[`c410ea14`](https://github.com/cloudflare/workers-sdk/commit/c410ea141f02f808ff3dddfa9ee21ccbb530acec)]:
  - miniflare@3.20231218.0

## 0.11.4

### Patch Changes

- Updated dependencies [[`eb08e2dc`](https://github.com/cloudflare/workers-sdk/commit/eb08e2dc3c0f09d16883f85201fbeb892e6f5a5b)]:
  - miniflare@3.20231030.4

## 0.11.3

### Patch Changes

- Updated dependencies [[`71fb0b86`](https://github.com/cloudflare/workers-sdk/commit/71fb0b86cf0ed81cc29ad71792edbba3a79ba87c), [`63708a94`](https://github.com/cloudflare/workers-sdk/commit/63708a94fb7a055bf15fa963f2d598b47b11d3c0)]:
  - miniflare@3.20231030.3

## 0.11.2

### Patch Changes

- Updated dependencies [[`1b348782`](https://github.com/cloudflare/workers-sdk/commit/1b34878287e3c98e8743e0a9c30b860107d4fcbe)]:
  - miniflare@3.20231030.2

## 0.11.1

### Patch Changes

- Updated dependencies [[`be2b9cf5`](https://github.com/cloudflare/workers-sdk/commit/be2b9cf5a9395cf7385f59d2e1ec3131dae3d87f), [`d9908743`](https://github.com/cloudflare/workers-sdk/commit/d99087433814e4f1fb98cd61b03b6e2f606b1a15)]:
  - miniflare@3.20231030.1

## 0.11.0

### Minor Changes

- [#4051](https://github.com/cloudflare/workers-sdk/pull/4051) [`4578d647`](https://github.com/cloudflare/workers-sdk/commit/4578d647060de37a34b5f4aedbcf17b4e2d27382) Thanks [@taoky](https://github.com/taoky)! - fix: remove extension name check when generating response

  Current regex logic to check whether a pathname is a file (has file extension) is causing trouble for some websites, and now \${pathname}/index.html is always checked before returning notFound().

### Patch Changes

- Updated dependencies [[`4f8b3420`](https://github.com/cloudflare/workers-sdk/commit/4f8b3420f93197d331491f012ff6f4626411bfc5), [`16cc2e92`](https://github.com/cloudflare/workers-sdk/commit/16cc2e923733b3c583b5bf6c40384c52fea04991), [`3637d97a`](https://github.com/cloudflare/workers-sdk/commit/3637d97a99c9d5e8d0d2b5f3adaf4bd9993265f0), [`29a59d4e`](https://github.com/cloudflare/workers-sdk/commit/29a59d4e72e3ae849474325c5c93252a3f84af0d), [`7fbe1937`](https://github.com/cloudflare/workers-sdk/commit/7fbe1937b311f36077c92814207bbb15ef3878d6), [`76787861`](https://github.com/cloudflare/workers-sdk/commit/767878613eda535d125539a478d488d1a42feaa1), [`8a25b7fb`](https://github.com/cloudflare/workers-sdk/commit/8a25b7fba94c8e9989412bc266ada307975f182d)]:
  - miniflare@3.20231030.0

## 0.10.1

### Patch Changes

- [#4206](https://github.com/cloudflare/workers-sdk/pull/4206) [`8e927170`](https://github.com/cloudflare/workers-sdk/commit/8e927170c4b6ce4310e563ce528c2ea20d3de9e7) Thanks [@1000hz](https://github.com/1000hz)! - chore: bump `miniflare` to [`3.20231016.0`](https://github.com/cloudflare/miniflare/releases/tag/v3.20231016.0)

## 0.10.0

### Minor Changes

- [#4093](https://github.com/cloudflare/workers-sdk/pull/4093) [`c71d8a0f`](https://github.com/cloudflare/workers-sdk/commit/c71d8a0f73c0abbf76434d7aa7634af53ce7b29b) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: bump `miniflare` to [`3.20231002.0`](https://github.com/cloudflare/miniflare/releases/tag/v3.20231002.0)

### Patch Changes

- [#4107](https://github.com/cloudflare/workers-sdk/pull/4107) [`807ab931`](https://github.com/cloudflare/workers-sdk/commit/807ab9316f1ce984f76302c9d9d5627c81617262) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: bump `miniflare` to [`3.20231002.1`](https://github.com/cloudflare/miniflare/releases/tag/v3.20231002.1)

## 0.9.0

### Minor Changes

- [#3895](https://github.com/cloudflare/workers-sdk/pull/3895) [`40f56562`](https://github.com/cloudflare/workers-sdk/commit/40f565628aaef2cad745aeeb4da297e7a6973e0d) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: bump `miniflare` to [`3.20230904.0`](https://github.com/cloudflare/miniflare/releases/tag/v3.20230904.0)

## 0.8.2

### Patch Changes

- [#3870](https://github.com/cloudflare/workers-sdk/pull/3870) [`2a6fdd9e`](https://github.com/cloudflare/workers-sdk/commit/2a6fdd9e2a16bc883bd87e828927d47655d032ed) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Requests for Cloudflare Pages which match against a `_headers` rule now match regardless of the incoming request's port

## 0.8.1

### Patch Changes

- [#3765](https://github.com/cloudflare/workers-sdk/pull/3765) [`e17d3096`](https://github.com/cloudflare/workers-sdk/commit/e17d3096ecde7cf697f7d5bc6ebc3a868eb88cfa) Thanks [@RamIdeas](https://github.com/RamIdeas)! - bump miniflare version to 3.20230814.1

## 0.8.0

### Minor Changes

- [#3675](https://github.com/cloudflare/workers-sdk/pull/3675) [`f753f3af`](https://github.com/cloudflare/workers-sdk/commit/f753f3afb7478bb289b39c44b33acbcefe06e99a) Thanks [@1000hz](https://github.com/1000hz)! - chore: upgrade `miniflare` to [`3.20230724.0`](https://github.com/cloudflare/miniflare/releases/tag/v3.20230724.0)

## 0.7.0

### Minor Changes

- [#3628](https://github.com/cloudflare/workers-sdk/pull/3628) [`e72a5794`](https://github.com/cloudflare/workers-sdk/commit/e72a5794f219e21ede701a7184a4691058366753) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: upgrade `miniflare` to [`3.20230717.0`](https://github.com/cloudflare/miniflare/releases/tag/v3.20230717.0)

## 0.6.0

### Minor Changes

- [#3583](https://github.com/cloudflare/workers-sdk/pull/3583) [`78ddb8de`](https://github.com/cloudflare/workers-sdk/commit/78ddb8de78152b2cb4180f23b51ee5478637d92d) Thanks [@penalosa](https://github.com/penalosa)! - Upgrade Miniflare (and hence `workerd`) to `v3.20230710.0`.

## 0.5.3

### Patch Changes

- [#3541](https://github.com/cloudflare/workers-sdk/pull/3541) [`09f317d4`](https://github.com/cloudflare/workers-sdk/commit/09f317d4c42d1787bdc636f13b4a303fa9a5b4b0) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Bump miniflare@3.0.2

## 0.5.2

### Patch Changes

- [#3454](https://github.com/cloudflare/workers-sdk/pull/3454) [`a2194043`](https://github.com/cloudflare/workers-sdk/commit/a2194043c6c755e9308b3ffc1e9afb0d1544f6b9) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: upgrade `miniflare` to `3.0.1`

  This version ensures root CA certificates are trusted on Windows.
  It also loads extra certificates from the `NODE_EXTRA_CA_CERTS` environment variable,
  allowing `wrangler dev` to be used with Cloudflare WARP enabled.

## 0.5.1

### Patch Changes

- [#2921](https://github.com/cloudflare/workers-sdk/pull/2921) [`066f0b05`](https://github.com/cloudflare/workers-sdk/commit/066f0b050e90351190386764604daaa068a69b73) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Add `x-deployment-id` header when opted-in

## 0.5.0

### Minor Changes

- [#3150](https://github.com/cloudflare/workers-sdk/pull/3150) [`7512d4cc`](https://github.com/cloudflare/workers-sdk/commit/7512d4cc3cb3a0d3d6d766aeb1f912fdb8493d0b) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: upgrade `miniflare` to [`2.14.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.14.0)

## 0.4.2

### Patch Changes

- [#3136](https://github.com/cloudflare/workers-sdk/pull/3136) [`823258cd`](https://github.com/cloudflare/workers-sdk/commit/823258cdf7f41747963d87bdb018b510f26184b6) Thanks [@jahands](https://github.com/jahands)! - fix: Remove global flag in pages-shared regex

## 0.4.1

### Patch Changes

- [#3132](https://github.com/cloudflare/workers-sdk/pull/3132) [`b503336c`](https://github.com/cloudflare/workers-sdk/commit/b503336cb3a03bb5cff7841196e144eafb6f2ef6) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - pages-shared: Strip spaces in urls

* [#3131](https://github.com/cloudflare/workers-sdk/pull/3131) [`7b12604e`](https://github.com/cloudflare/workers-sdk/commit/7b12604e24434a8b4343480bebf3b1e6737336a0) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - Prevent protocol-less URL redirects for %09 (with backslashes)

## 0.4.0

### Minor Changes

- [#3083](https://github.com/cloudflare/workers-sdk/pull/3083) [`277a49b1`](https://github.com/cloudflare/workers-sdk/commit/277a49b167272d61b6c2345fe74b71d63a12666b) Thanks [@Skye-31](https://github.com/Skye-31)! - Feat(metadata-generator): Introduce validation for `/* /index.html` rules.

## 0.3.5

### Patch Changes

- [#3052](https://github.com/cloudflare/workers-sdk/pull/3052) [`45166d38`](https://github.com/cloudflare/workers-sdk/commit/45166d38c37fe409cce11eed2f230cb062e72d6a) Thanks [@Skye-31](https://github.com/Skye-31)! - Reimplement \_redirects proxying in pages-shared

  This change reverts #3038

## 0.3.4

### Patch Changes

- [#3041](https://github.com/cloudflare/workers-sdk/pull/3041) [`b8eb093c`](https://github.com/cloudflare/workers-sdk/commit/b8eb093c903d78fd656cf9a4759d640687b96e80) Thanks [@jahands](https://github.com/jahands)! - Prevent protocol-less URL redirects (with backslashes)

## 0.3.3

### Patch Changes

- [#3037](https://github.com/cloudflare/workers-sdk/pull/3037) [`f96ec321`](https://github.com/cloudflare/workers-sdk/commit/f96ec32182a6f00338d760c933dc64d47c3f0e05) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Prevent protocol-less URL redirects

* [#3037](https://github.com/cloudflare/workers-sdk/pull/3037) [`f96ec321`](https://github.com/cloudflare/workers-sdk/commit/f96ec32182a6f00338d760c933dc64d47c3f0e05) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Sort the order of \_redirects static redirects correctly

## 0.3.2

### Patch Changes

- [#3038](https://github.com/cloudflare/workers-sdk/pull/3038) [`978471a9`](https://github.com/cloudflare/workers-sdk/commit/978471a9ff5ad7b66d48952d0a05c2cc383912c7) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Revert #2303 duplicating hash component

## 0.3.1

### Patch Changes

- [#3036](https://github.com/cloudflare/workers-sdk/pull/3036) [`e4ca780f`](https://github.com/cloudflare/workers-sdk/commit/e4ca780f1e22af157aa6393008fe4f650b031f11) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Temporarily remove proxying from pages-shared

## 0.3.0

### Minor Changes

- [#2942](https://github.com/cloudflare/workers-sdk/pull/2942) [`dc1465ea`](https://github.com/cloudflare/workers-sdk/commit/dc1465ea64acf3fc9c1442e7df73f14df7dc8630) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: upgrade `miniflare` to [`2.13.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.13.0)

## 0.2.0

### Minor Changes

- [#2708](https://github.com/cloudflare/workers-sdk/pull/2708) [`b3346cfb`](https://github.com/cloudflare/workers-sdk/commit/b3346cfbecb2c20f7cce3c3bf8a585b7fd8811aa) Thanks [@Skye-31](https://github.com/Skye-31)! - Feat: Pages now supports Proxying (200 status) redirects in it's \_redirects file

  This will look something like the following, where a request to /users/123 will appear as that in the browser, but will internally go to /users/[id].html.

  ```
  /users/:id /users/[id] 200
  ```

### Patch Changes

- [#2771](https://github.com/cloudflare/workers-sdk/pull/2771) [`4ede044e`](https://github.com/cloudflare/workers-sdk/commit/4ede044e9247fdc689cbe537dcc5afbda71cf99c) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: upgrade `miniflare` to [`2.12.1`](https://github.com/cloudflare/miniflare/releases/tag/v2.12.1) and `@miniflare/tre` to [`3.0.0-next.10`](https://github.com/cloudflare/miniflare/releases/tag/v3.0.0-next.10)

## 0.1.0

### Minor Changes

- [#2717](https://github.com/cloudflare/workers-sdk/pull/2717) [`c5943c9f`](https://github.com/cloudflare/workers-sdk/commit/c5943c9fe54e8bcf9ee1bf8ca992d2f8b84360a1) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to [`2.12.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.12.0), including support for R2 multipart upload bindings, the `nodejs_compat` compatibility flag, D1 fixes and more!

## 0.0.13

### Patch Changes

- [#2502](https://github.com/cloudflare/workers-sdk/pull/2502) [`6b7ebc8d`](https://github.com/cloudflare/workers-sdk/commit/6b7ebc8dd0dee5521bce49a6dfff997d308e900e) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to [`2.11.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.11.0)

## 0.0.12

### Patch Changes

- [#2339](https://github.com/cloudflare/workers-sdk/pull/2339) [`f6821189`](https://github.com/cloudflare/workers-sdk/commit/f6821189110e5b6301fe77509a6bb9a8652bbc1b) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: `wrangler dev --local` now correctly lazy-imports `@miniflare/tre`

  Previously, we introduced a bug where we were incorrectly requiring `@miniflare/tre`, even when not using the `workerd`/`--experimental-local` mode.

## 0.0.11

### Patch Changes

- [#2303](https://github.com/cloudflare/workers-sdk/pull/2303) [`1a1f1dc7`](https://github.com/cloudflare/workers-sdk/commit/1a1f1dc7fc8cad06030d3feac1258e2fb3118d8c) Thanks [@jrf0110](https://github.com/jrf0110)! - fix: Pages asset-server duplicating the hash component
  fix: Pages metadata missing line numbers. This could have resulted in redirects precedence ordering not being respected.

* [#2268](https://github.com/cloudflare/workers-sdk/pull/2268) [`3be1c2cf`](https://github.com/cloudflare/workers-sdk/commit/3be1c2cf99fdaef1e612937ccc487a5196c5df67) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Add support for `--experimental-local` to `wrangler pages dev` which will use the `workerd` runtime.

  Add `@miniflare/tre` environment polyfill to `@cloudflare/pages-shared`.

## 0.0.10

### Patch Changes

- [#2146](https://github.com/cloudflare/workers-sdk/pull/2146) [`c987fceb`](https://github.com/cloudflare/workers-sdk/commit/c987fcebfe8ebd61fd762371a108f28eaae4c71e) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Add a `failOpen` prop to the deployment metadata.

## 0.0.9

### Patch Changes

- [#2004](https://github.com/cloudflare/workers-sdk/pull/2004) [`f2d5728f`](https://github.com/cloudflare/workers-sdk/commit/f2d5728fc10f1ef8298b777ffb586ff315f00a35) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Slightly relax the selectors for generating `Link` headers from `<link>` elements in Pages Early Hints feature

  Previously, we'd only generate `Link` headers if the `rel="preload"` or `rel="preconnect"` matched exactly. Now, this change will generate `Link` headers if `preload` or `preconnect` appears as a whitespace-separated value in the `rel` attribute. For example, `rel="stylesheet preconnect"` is now valid.

  For more info, check out [this GitHub issue on the Cloudflare Developer Docs repo](https://github.com/cloudflare/cloudflare-docs/pull/6183#issuecomment-1272007522).

* [#2003](https://github.com/cloudflare/workers-sdk/pull/2003) [`3ed06b40`](https://github.com/cloudflare/workers-sdk/commit/3ed06b4096d3ea9ed601ae05d77442e5b0217678) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Bump miniflare@2.10.0
