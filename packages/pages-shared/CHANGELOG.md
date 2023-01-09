# @cloudflare/pages-shared

## 0.0.13

### Patch Changes

- [#2502](https://github.com/cloudflare/wrangler2/pull/2502) [`6b7ebc8d`](https://github.com/cloudflare/wrangler2/commit/6b7ebc8dd0dee5521bce49a6dfff997d308e900e) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to [`2.11.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.11.0)

## 0.0.12

### Patch Changes

- [#2339](https://github.com/cloudflare/wrangler2/pull/2339) [`f6821189`](https://github.com/cloudflare/wrangler2/commit/f6821189110e5b6301fe77509a6bb9a8652bbc1b) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: `wrangler dev --local` now correctly lazy-imports `@miniflare/tre`

  Previously, we introduced a bug where we were incorrectly requiring `@miniflare/tre`, even when not using the `workerd`/`--experimental-local` mode.

## 0.0.11

### Patch Changes

- [#2303](https://github.com/cloudflare/wrangler2/pull/2303) [`1a1f1dc7`](https://github.com/cloudflare/wrangler2/commit/1a1f1dc7fc8cad06030d3feac1258e2fb3118d8c) Thanks [@jrf0110](https://github.com/jrf0110)! - fix: Pages asset-server duplicating the hash component
  fix: Pages metadata missing line numbers. This could have resulted in redirects precedence ordering not being respected.

* [#2268](https://github.com/cloudflare/wrangler2/pull/2268) [`3be1c2cf`](https://github.com/cloudflare/wrangler2/commit/3be1c2cf99fdaef1e612937ccc487a5196c5df67) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Add support for `--experimental-local` to `wrangler pages dev` which will use the `workerd` runtime.

  Add `@miniflare/tre` environment polyfill to `@cloudflare/pages-shared`.

## 0.0.10

### Patch Changes

- [#2146](https://github.com/cloudflare/wrangler2/pull/2146) [`c987fceb`](https://github.com/cloudflare/wrangler2/commit/c987fcebfe8ebd61fd762371a108f28eaae4c71e) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Add a `failOpen` prop to the deployment metadata.

## 0.0.9

### Patch Changes

- [#2004](https://github.com/cloudflare/wrangler2/pull/2004) [`f2d5728f`](https://github.com/cloudflare/wrangler2/commit/f2d5728fc10f1ef8298b777ffb586ff315f00a35) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Slightly relax the selectors for generating `Link` headers from `<link>` elements in Pages Early Hints feature

  Previously, we'd only generate `Link` headers if the `rel="preload"` or `rel="preconnect"` matched exactly. Now, this change will generate `Link` headers if `preload` or `preconnect` appears as a whitespace-separated value in the `rel` attribute. For example, `rel="stylesheet preconnect"` is now valid.

  For more info, check out [this GitHub issue on the Cloudflare Developer Docs repo](https://github.com/cloudflare/cloudflare-docs/pull/6183#issuecomment-1272007522).

* [#2003](https://github.com/cloudflare/wrangler2/pull/2003) [`3ed06b40`](https://github.com/cloudflare/wrangler2/commit/3ed06b4096d3ea9ed601ae05d77442e5b0217678) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Bump miniflare@2.10.0
