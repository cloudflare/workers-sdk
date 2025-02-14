# @cloudflare/workers-shared

## 0.14.1

### Patch Changes

- [#8116](https://github.com/cloudflare/workers-sdk/pull/8116) [`ee4873c`](https://github.com/cloudflare/workers-sdk/commit/ee4873c963b89b0091a2ff0952c274ef9dbf05ad) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Adds a RewriteFrames integration for workers-shared Sentry source-mappings.

- [#8122](https://github.com/cloudflare/workers-sdk/pull/8122) [`e8829e3`](https://github.com/cloudflare/workers-sdk/commit/e8829e3b152cdec6f5bf75713a98297f45bd60fe) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: interpolation search method now checks for a single match at the beginning of every iteration

- [#8115](https://github.com/cloudflare/workers-sdk/pull/8115) [`dba3f21`](https://github.com/cloudflare/workers-sdk/commit/dba3f21587ad294c7e45737e7c776d033cd80dd8) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Bump interpolation search method for asset manifest reading to 1%

- [#8117](https://github.com/cloudflare/workers-sdk/pull/8117) [`08e37f6`](https://github.com/cloudflare/workers-sdk/commit/08e37f6e28c38e064aeca95de1b3d63d8cacbb2d) Thanks [@WalshyDev](https://github.com/WalshyDev)! - Change asset-worker and router-worker analytics to using version tag rather than version UUID.

- [#8126](https://github.com/cloudflare/workers-sdk/pull/8126) [`59eda4a`](https://github.com/cloudflare/workers-sdk/commit/59eda4af54f8eada5324bbd3014c41c934e566ac) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Add status code analytics to router-worker

- [#8105](https://github.com/cloudflare/workers-sdk/pull/8105) [`f2e6e74`](https://github.com/cloudflare/workers-sdk/commit/f2e6e748989e283642e8b1496a789ca2bcd15757) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Handles a divide by zero error that could occur when searching large manifests

- [#8127](https://github.com/cloudflare/workers-sdk/pull/8127) [`d4d5987`](https://github.com/cloudflare/workers-sdk/commit/d4d5987c9f567901542c22cb1df13e56cb286887) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Bump interpoplation search method for asset manifest reads to 50%

## 0.14.0

### Minor Changes

- [#8094](https://github.com/cloudflare/workers-sdk/pull/8094) [`d83dd19`](https://github.com/cloudflare/workers-sdk/commit/d83dd1912baf680df45cea4bbdeae77d2d7013aa) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Provides sentry sourcemap generation and upload on production deploys.

- [#8084](https://github.com/cloudflare/workers-sdk/pull/8084) [`2547c0f`](https://github.com/cloudflare/workers-sdk/commit/2547c0fcca80ac3fde9fed292c3c477218fbd096) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Rollout interpolation search method for asset manifests (1 / 20,000 requests)

## 0.13.2

### Patch Changes

- [#8044](https://github.com/cloudflare/workers-sdk/pull/8044) [`7006630`](https://github.com/cloudflare/workers-sdk/commit/7006630cfe307da4840651bc8b6da102660e3f1a) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Adds analytics and code (zero-percent gated) for a new asset manifest search algorithm

## 0.13.1

### Patch Changes

- [#7989](https://github.com/cloudflare/workers-sdk/pull/7989) [`cf09cfa`](https://github.com/cloudflare/workers-sdk/commit/cf09cfa33db317740a54c8b6b035a7e84b95c6ec) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Adds additional error messaging for errors from KV.

- [#7996](https://github.com/cloudflare/workers-sdk/pull/7996) [`f9fd9df`](https://github.com/cloudflare/workers-sdk/commit/f9fd9df8f6e11d87bb34ed5005730de1d593989a) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Provide shorter message for KV GET errors.

## 0.13.0

### Minor Changes

- [#7897](https://github.com/cloudflare/workers-sdk/pull/7897) [`34f9797`](https://github.com/cloudflare/workers-sdk/commit/34f9797822836b98edc4d8ddc6e2fb0ab322b864) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - chore: provides `run_worker_first` for Worker-script-first configuration. Deprecates `experimental_serve_directly`.

## 0.12.5

### Patch Changes

- [#7906](https://github.com/cloudflare/workers-sdk/pull/7906) [`f5eaf4b`](https://github.com/cloudflare/workers-sdk/commit/f5eaf4bd2fcfdf19a40dd3056fc9b36c2654605c) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Fixes bug in router-worker that prevents unexpected errors from being captured.

## 0.12.4

### Patch Changes

- [#7887](https://github.com/cloudflare/workers-sdk/pull/7887) [`cab3e37`](https://github.com/cloudflare/workers-sdk/commit/cab3e37f66e8cbcf0f16898eff1827db1126901b) Thanks [@WalshyDev](https://github.com/WalshyDev)! - chore: add more observability into asset-worker for the Workers team to better insight into how requests are handled.

- [#7887](https://github.com/cloudflare/workers-sdk/pull/7887) [`cab3e37`](https://github.com/cloudflare/workers-sdk/commit/cab3e37f66e8cbcf0f16898eff1827db1126901b) Thanks [@WalshyDev](https://github.com/WalshyDev)! - chore: add tracing into router-worker so the Workers team can have a better insight into into how requests are handled.

## 0.12.3

### Patch Changes

- [#7844](https://github.com/cloudflare/workers-sdk/pull/7844) [`92ed81e`](https://github.com/cloudflare/workers-sdk/commit/92ed81e9f35c4bc951da79be7fb08e7e60fb1f48) Thanks [@WalshyDev](https://github.com/WalshyDev)! - chore: plumb through account ID and Worker ID into the asset-worker and router-worker for use in analytics and error reporting.

## 0.12.2

### Patch Changes

- [#7808](https://github.com/cloudflare/workers-sdk/pull/7808) [`7faabeb`](https://github.com/cloudflare/workers-sdk/commit/7faabeb1d1534818d0e93fe4e4710e9b77af1bfb) Thanks [@WalshyDev](https://github.com/WalshyDev)! - fix: fix analytics not being logged for `asset-worker` in the case of a successful request.

## 0.12.1

### Patch Changes

- [#7790](https://github.com/cloudflare/workers-sdk/pull/7790) [`c588c8a`](https://github.com/cloudflare/workers-sdk/commit/c588c8a79592979ef62489516593df7ca5b96901) Thanks [@WalshyDev](https://github.com/WalshyDev)! - fix: remove `--experimental-versions` flag from the Asset/Router Workers `deploy` scripts, now that Wrangler has removed the flag.

## 0.12.0

### Minor Changes

- [#7761](https://github.com/cloudflare/workers-sdk/pull/7761) [`bb85c9a`](https://github.com/cloudflare/workers-sdk/commit/bb85c9ac10d23407085ff8cd479bd0469835c60f) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Adds jaeger tracing for asset-worker.

### Patch Changes

- [#7768](https://github.com/cloudflare/workers-sdk/pull/7768) [`97603f0`](https://github.com/cloudflare/workers-sdk/commit/97603f031b30b8a289519ff48f2c2c39b1396656) Thanks [@WalshyDev](https://github.com/WalshyDev)! - fix: on a 404 from KV, we do not want the asset to stay in cache for the normal 1 year TTL. Instead we want to re-insert with a 60s TTL to revalidate and prevent a bad 404 from persisting.

## 0.11.2

### Patch Changes

- [#7612](https://github.com/cloudflare/workers-sdk/pull/7612) [`2e78812`](https://github.com/cloudflare/workers-sdk/commit/2e78812ade7cd7361b023c90afe06221a52b79eb) Thanks [@Cherry](https://github.com/Cherry)! - fix: resolves an issue where a malformed path such as `https://example.com/%A0` would cause an unhandled error

## 0.11.1

### Patch Changes

- [#7598](https://github.com/cloudflare/workers-sdk/pull/7598) [`178fd01`](https://github.com/cloudflare/workers-sdk/commit/178fd0123d8d4baf9f395bd8aade2cf1dccb6aa8) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Dummy workers-shared version bump

  The Router Worker and Asset Worker of `workers-shared` are currently in a weird state that prevents us to redeploy them. The current versions of these workers are developer modified due to adding secrets. We want a CI controlled version to safely use these secrets.

  This commit performs a dummy `workers-shared` version bump to unlock us from this blocked state.

## 0.11.0

### Minor Changes

- [#7465](https://github.com/cloudflare/workers-sdk/pull/7465) [`5449fe5`](https://github.com/cloudflare/workers-sdk/commit/5449fe54b15cf7c6dd12c385b0c8d2883c641b80) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Instrument analytics around assets.serve_directly

## 0.10.0

### Minor Changes

- [#7445](https://github.com/cloudflare/workers-sdk/pull/7445) [`f4ae6ee`](https://github.com/cloudflare/workers-sdk/commit/f4ae6ee17a0bd487aa0680a0a7c0757256dee36d) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Support for `assets.experimental_serve_directly` with `wrangler dev`

## 0.9.1

### Patch Changes

- [#7410](https://github.com/cloudflare/workers-sdk/pull/7410) [`6b21919`](https://github.com/cloudflare/workers-sdk/commit/6b21919a3d8042afa0270c825bc119e9b58c0455) Thanks [@WalshyDev](https://github.com/WalshyDev)! - chore: remove awaits from Asset Worker fetches. This has no user-facing impact.

## 0.9.0

### Minor Changes

- [#7303](https://github.com/cloudflare/workers-sdk/pull/7303) [`0d314ed`](https://github.com/cloudflare/workers-sdk/commit/0d314ed14145d50b8fd00fdae8b31fb043f4d31a) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Preparatory work to allow invoking user worker ahead of assets

### Patch Changes

- [#7176](https://github.com/cloudflare/workers-sdk/pull/7176) [`476e5df`](https://github.com/cloudflare/workers-sdk/commit/476e5df5d9f0a2aa3d713160994da3e2a752418e) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Remove incorrect logic in Asset Worker.

## 0.8.0

### Minor Changes

- [#7318](https://github.com/cloudflare/workers-sdk/pull/7318) [`6ba5903`](https://github.com/cloudflare/workers-sdk/commit/6ba5903201de34cb3a8a5610fa11825279171a7e) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Prevent same-schema attacks

## 0.7.1

### Patch Changes

- [#7183](https://github.com/cloudflare/workers-sdk/pull/7183) [`08c6580`](https://github.com/cloudflare/workers-sdk/commit/08c6580494e702373d17ff7485988a8fae9af59e) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Fixes bug where indexId was never set for router-worker and asset-worker

## 0.7.0

### Minor Changes

- [#7053](https://github.com/cloudflare/workers-sdk/pull/7053) [`8dc2b7d`](https://github.com/cloudflare/workers-sdk/commit/8dc2b7d739239411ac29e419c22d22c291777042) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Adds analytics to asset-worker

## 0.6.0

### Minor Changes

- [#6941](https://github.com/cloudflare/workers-sdk/pull/6941) [`fd43068`](https://github.com/cloudflare/workers-sdk/commit/fd430687ec1431be6c3af1b7420278b636c36e59) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - feat: Add observability to router-worker

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
