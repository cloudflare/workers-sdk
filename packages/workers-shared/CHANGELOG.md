# @cloudflare/workers-shared

## 0.5.4

### Patch Changes

- [#6728](https://github.com/cloudflare/workers-sdk/pull/6728) [`1ca313f`](https://github.com/cloudflare/workers-sdk/commit/1ca313f2041688cd13e25f0817e3b72dfc930bac) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: remove filepath encoding on asset upload and handle sometimes-encoded characters

  Some characters like [ ] @ are encoded by encodeURIComponent() but are often requested at an unencoded URL path.
  This change will make assets with filenames with these characters accessible at both the encoded and unencoded paths,
  but to use the encoded path as the canonical one, and to redirect requests to the canonical path if necessary.

## 0.5.3

### Patch Changes

- [#6712](https://github.com/cloudflare/workers-sdk/pull/6712) [`7a8bb17`](https://github.com/cloudflare/workers-sdk/commit/7a8bb17a5f35e11cba336ca1bc5ea16413291bc7) Thanks [@penalosa](https://github.com/penalosa)! - fix: Use D&C token when deploying

## 0.5.2

### Patch Changes

- [#6708](https://github.com/cloudflare/workers-sdk/pull/6708) [`31bfd37`](https://github.com/cloudflare/workers-sdk/commit/31bfd374cf6764c1e8a4491518c58cb112010340) Thanks [@penalosa](https://github.com/penalosa)! - fix: Use `pnpx` for `wrangler deploy`

- [#6709](https://github.com/cloudflare/workers-sdk/pull/6709) [`5d8547e`](https://github.com/cloudflare/workers-sdk/commit/5d8547e26e9f5e2eb9516b17a096cd1ea9f63469) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Add missing config params to asset-worker and router-worker

## 0.5.1

### Patch Changes

- [#6670](https://github.com/cloudflare/workers-sdk/pull/6670) [`fed1fda`](https://github.com/cloudflare/workers-sdk/commit/fed1fda90d1434b5ce214656249b0ad723ce48c1) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Rename asset-worker RPC methods as unstable\_\*

  The Asset Worker is currently set up as a `WorkerEntrypoint` class so that it is able to accept RPC calls to any of its public methods. There are currently four such public methods defined on this Worker: `canFetch`, `getByETag`, `getByPathname` and `exists`. While we are stabilising the implementation details of these methods, we would like to prevent developers from having their Workers call these methods directly. To that end, we are adopting the `unstable_<method_name>` naming convention for all of the aforementioned methods, to indicate that they are still in flux and that they are not an established API contract.

## 0.5.0

### Minor Changes

- [#6631](https://github.com/cloudflare/workers-sdk/pull/6631) [`59a0072`](https://github.com/cloudflare/workers-sdk/commit/59a0072740aa19f8d2b7524b993a7be35ba67fce) Thanks [@emily-shen](https://github.com/emily-shen)! - feat: Add asset config behaviour.

  Add `html_handling` (e.g. /index.html -> /) with options `"auto-trailing-slash" | "force-trailing-slash" | "drop-trailing-slash" | "none"` to Asset Worker.

  Add `not_found_handling` behaviour with options `"404-page" | "single-page-application" | "none"` to Asset Worker.

## 0.4.1

### Patch Changes

- [#6588](https://github.com/cloudflare/workers-sdk/pull/6588) [`45ad2e0`](https://github.com/cloudflare/workers-sdk/commit/45ad2e0c83f1382e1662aadc2b145969ed9a719b) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Stabilize Workers naming across `workers-shared`

  The Asset Worker and Router Worker use inconsistent naming conventions across `workers-shared`. This commit stabilizes the naming to Asset Worker and Router Worker and permutations of those.

## 0.4.0

### Minor Changes

- [#6539](https://github.com/cloudflare/workers-sdk/pull/6539) [`6c057d1`](https://github.com/cloudflare/workers-sdk/commit/6c057d10b22e9a2e08aa066e074c792cff78d1da) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Add basic Asset Worker behaviour

  This commit implements a basic Asset Worker behaviour, including:

  - headers handling
  - `200`/`404`/`500` response handling
  - fetching data from KV

## 0.3.0

### Minor Changes

- [#6537](https://github.com/cloudflare/workers-sdk/pull/6537) [`f5bde66`](https://github.com/cloudflare/workers-sdk/commit/f5bde66914d24c59da35e051c5343c8f0554f782) Thanks [@emily-shen](https://github.com/emily-shen)! - feat: add basic Router Worker to workers-shared

## 0.2.0

### Minor Changes

- [#6403](https://github.com/cloudflare/workers-sdk/pull/6403) [`00f340f`](https://github.com/cloudflare/workers-sdk/commit/00f340f7c1709db777e80a8ea24d245909ff4486) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Extend KV plugin behaviour to support Workers assets

  This commit extends Miniflare's KV plugin's behaviour to support Workers assets, and therefore enables the emulation of Workers with assets in local development.

## 0.1.0

### Minor Changes

- [#6370](https://github.com/cloudflare/workers-sdk/pull/6370) [`8a3c6c0`](https://github.com/cloudflare/workers-sdk/commit/8a3c6c00105a3420e46da660bd3f317b26f1c6d4) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Create very basic Asset Server Worker and plumb it into `wrangler dev`

  These changes do the ground work needed in order to add Assets support for Workers in `wrangler dev`. They implement the following:

  - it creates a new package called `workers-shared` that hosts the `Asset Server Worker`, and the `Router Worker`in the future
  - it scaffolds the `Asset Server Worker` in some very basic form, with basic configuration. Further behaviour implementation will follow in a subsequent PR
  - it does the ground work of plumbing ASW into Miniflare
