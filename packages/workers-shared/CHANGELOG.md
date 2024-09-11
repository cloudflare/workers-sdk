# @cloudflare/workers-shared

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
