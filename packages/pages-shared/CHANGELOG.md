# @cloudflare/pages-shared

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
