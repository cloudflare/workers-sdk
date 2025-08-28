# @cloudflare/workers-shared

## 0.18.7

### Patch Changes

- [#10462](https://github.com/cloudflare/workers-sdk/pull/10462) [`c4e164c`](https://github.com/cloudflare/workers-sdk/commit/c4e164c13a830a4c6426c318061a0f13b4281c67) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Update mime dependency to 4.X so that javascript files will have content types of `text/javascript` instead of `application/javascript`. This will affect the content-types computed by Asset Worker within Workers Static Assets.

## 0.18.6

### Patch Changes

- [#10402](https://github.com/cloudflare/workers-sdk/pull/10402) [`8fd6dc0`](https://github.com/cloudflare/workers-sdk/commit/8fd6dc0f4de1c9c215fdbd44aa2644096bee7bd0) Thanks [@danielrs](https://github.com/danielrs)! - Sanitize double-slashes in asset-worker relative redirects.

  Without sanitizing, some relative redirect patterns were being treated as external redirects.

## 0.18.5

### Patch Changes

- [#10007](https://github.com/cloudflare/workers-sdk/pull/10007) [`d82c8e8`](https://github.com/cloudflare/workers-sdk/commit/d82c8e807d4f22cafe9ae3e9db5477ebe35c819b) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Bugfix: Removes unnecessary cloning of the request. This is no longer needed. We were also seeing failures in runtime for large files due to this.

- [#10008](https://github.com/cloudflare/workers-sdk/pull/10008) [`ca00d74`](https://github.com/cloudflare/workers-sdk/commit/ca00d741fbf4729785fbc5ec28110c873ee231dd) Thanks [@vicb](https://github.com/vicb)! - block responses with multiple Content Type values

## 0.18.4

### Patch Changes

- [#9935](https://github.com/cloudflare/workers-sdk/pull/9935) [`2765b88`](https://github.com/cloudflare/workers-sdk/commit/2765b88bbd2d6c84afbc17953f731fddd6ffab2d) Thanks [@vicb](https://github.com/vicb)! - allow plain text with charset

## 0.18.3

### Patch Changes

- [#9908](https://github.com/cloudflare/workers-sdk/pull/9908) [`ab75fd8`](https://github.com/cloudflare/workers-sdk/commit/ab75fd8303084fba48ee5131e4ccf19510aed831) Thanks [@GregBrimble](https://github.com/GregBrimble)! - perf: graduate asset-server binary search experiment to 100%

  The improved iterative binary search implementation has been graduated from a 50% experiment to the default implementation. This provides better performance for asset manifest lookups by replacing the recursive binary search with an iterative approach.

## 0.18.2

### Patch Changes

- [#9892](https://github.com/cloudflare/workers-sdk/pull/9892) [`78e259a`](https://github.com/cloudflare/workers-sdk/commit/78e259ac75795887c1bac7ebcb6f4cc636dc39e9) Thanks [@GregBrimble](https://github.com/GregBrimble)! - perf: increase binary search experiment sample rate to 50%

- [#9884](https://github.com/cloudflare/workers-sdk/pull/9884) [`a60e9da`](https://github.com/cloudflare/workers-sdk/commit/a60e9daf63d0d4918c134a45512e861d399c96c3) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - Adds metrics for time-to-dispatch to Router Worker

## 0.18.1

### Patch Changes

- [#9824](https://github.com/cloudflare/workers-sdk/pull/9824) [`8104705`](https://github.com/cloudflare/workers-sdk/commit/810470555f49c358b1ebc3f679183d1f8ea89028) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Allow "plain text" images when blocking vulnerable non-image responses

- [#9785](https://github.com/cloudflare/workers-sdk/pull/9785) [`07416ba`](https://github.com/cloudflare/workers-sdk/commit/07416ba644ef019f7cdccc7b3ed67f92abf03438) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - Handle next apps hosted at a path other than the root when blocking vulnerable non-image requests

## 0.18.0

### Minor Changes

- [#9661](https://github.com/cloudflare/workers-sdk/pull/9661) [`e216a76`](https://github.com/cloudflare/workers-sdk/commit/e216a76fba20acf06faad2d9b310a189fe3ccb08) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - Limit free tier requests in the Router worker

### Patch Changes

- [#9635](https://github.com/cloudflare/workers-sdk/pull/9635) [`b066cf8`](https://github.com/cloudflare/workers-sdk/commit/b066cf836a5fc8436068be42bf74100c4bcd58ea) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - Block possibly vulnerable requests to the router worker

## 0.17.6

### Patch Changes

- [#9416](https://github.com/cloudflare/workers-sdk/pull/9416) [`3383021`](https://github.com/cloudflare/workers-sdk/commit/33830214ff76ec4738b3e998370eca7568240e12) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - Adds support for static routing to Workers Assets

  Implements the proposal noted here https://github.com/cloudflare/workers-sdk/discussions/9143

  In brief: when static routing is present for a Worker with assets, routing via those static rules takes precedence. When a request is evaluated in the Router Worker, the request path is first compared to the `"asset_worker"` rules (which are to be specified via "negative" rules, e.g. `"!/api/assets"`). If any match, the request is forwarded directly to the Asset Worker. If instead any `"user_worker"` rules match, the request is forwarded directly to the User Worker. If neither match (or static routing was not provided), the existing behavior takes over.

  As part of this explicit routing, when static routing is present, the check against `Sec-Fetch-Mode: navigate` (to determine if this should serve an asset or go to the User Worker for not_found_handling) is disabled. Routing can be controlled by setting routing rules via `assets.run_worker_first` in your Wrangler configuration file.

## 0.17.5

### Patch Changes

- [#9050](https://github.com/cloudflare/workers-sdk/pull/9050) [`1be5644`](https://github.com/cloudflare/workers-sdk/commit/1be56441dec5e8faea3b6c007c1a347bab1a4029) Thanks [@WalshyDev](https://github.com/WalshyDev)! - Adds tracing to \_headers & \_redirects in Workers Assets allowing Cloudflare employees to better debug customer issues regarding these features.

## 0.17.4

### Patch Changes

- [#9033](https://github.com/cloudflare/workers-sdk/pull/9033) [`2c50115`](https://github.com/cloudflare/workers-sdk/commit/2c501151d3d1a563681cdb300a298b83862b60e2) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - chore: convert wrangler.toml files into wrangler.jsonc ones

## 0.17.3

### Patch Changes

- [#9043](https://github.com/cloudflare/workers-sdk/pull/9043) [`7744f1a`](https://github.com/cloudflare/workers-sdk/commit/7744f1a3039e01f593b6e578588e07d1139d1d93) Thanks [@WalshyDev](https://github.com/WalshyDev)! - Adds tracing into asset-worker unstable methods so we can better measure/debug these.

## 0.17.2

### Patch Changes

- [#8887](https://github.com/cloudflare/workers-sdk/pull/8887) [`511be3d`](https://github.com/cloudflare/workers-sdk/commit/511be3d17559e482fedf559cb61158e329c11d24) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Add log message when `Sec-Fetch-Mode: navigate` is responsible for assets routing decision in `wrangler dev`

## 0.17.1

### Patch Changes

- [#8643](https://github.com/cloudflare/workers-sdk/pull/8643) [`75005e3`](https://github.com/cloudflare/workers-sdk/commit/75005e3dc3d3dfc5becb5caf0896cd407c6c8386) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Support customizing the metafile limits

## 0.17.0

### Minor Changes

- [#8443](https://github.com/cloudflare/workers-sdk/pull/8443) [`3b1d081`](https://github.com/cloudflare/workers-sdk/commit/3b1d081b89892aa877c33ac63877db3eccedf062) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Requests with a `Sec-Fetch-Mode: navigate` header, made to a project with `sec_fetch_mode_navigate_header_prefers_asset_serving` compatibility flag, will be routed to the asset-worker rather than a user Worker when no exact asset match is found.

  Requests without that header will continue to be routed to the user Worker when no exact asset match is found.

## 0.16.0

### Minor Changes

- [#7334](https://github.com/cloudflare/workers-sdk/pull/7334) [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f) Thanks [@penalosa](https://github.com/penalosa)! - Packages in Workers SDK now support the versions of Node that Node itself supports (Current, Active, Maintenance). Currently, that includes Node v18, v20, and v22.

## 0.15.0

### Minor Changes

- [#8390](https://github.com/cloudflare/workers-sdk/pull/8390) [`53e6323`](https://github.com/cloudflare/workers-sdk/commit/53e63233c5b9bb786af3daea63c10ffe60a5d881) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Parse and apply metafiles (`_headers` and `_redirects`) in `wrangler dev` for Workers Assets

- [#8373](https://github.com/cloudflare/workers-sdk/pull/8373) [`08b8c46`](https://github.com/cloudflare/workers-sdk/commit/08b8c46872988da7599891f8f1700bcbc7f86968) Thanks [@WalshyDev](https://github.com/WalshyDev)! - Add `CF-Cache-Status` to Workers Assets responses to indicate if we returned a cached asset or not. This will also populate zone cache analytics and Logpush logs.

- [#8279](https://github.com/cloudflare/workers-sdk/pull/8279) [`aba0e9c`](https://github.com/cloudflare/workers-sdk/commit/aba0e9cad62e77cfa5fb3515ea9f89aa225059ed) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Add support for custom headers and redirects in asset-worker

## 0.14.5

### Patch Changes

- [#8338](https://github.com/cloudflare/workers-sdk/pull/8338) [`2d40989`](https://github.com/cloudflare/workers-sdk/commit/2d409892f1cf08f07f84d25dcab023bc20ada374) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Upload \_headers and \_redirects if present with Workers Assets as part of `wrangler deploy` and `wrangler versions upload`.

- [#8350](https://github.com/cloudflare/workers-sdk/pull/8350) [`56a8aed`](https://github.com/cloudflare/workers-sdk/commit/56a8aed9604491433154cc006d1ba2c3ab6ac1d1) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Removes non-public methods from asset-worker

## 0.14.4

### Patch Changes

- [#8247](https://github.com/cloudflare/workers-sdk/pull/8247) [`a9a4c33`](https://github.com/cloudflare/workers-sdk/commit/a9a4c33143b9f58673ac0cdd251957997275fa10) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Omits Content-Type header for files of an unknown extension in Workers Assets

## 0.14.3

### Patch Changes

- [`07613d3`](https://github.com/cloudflare/workers-sdk/commit/07613d3b231779466ca2528ce07385552ec73501) Thanks [@penalosa](https://github.com/penalosa)! - Trigger release after testing release process

## 0.14.2

### Patch Changes

- [#8138](https://github.com/cloudflare/workers-sdk/pull/8138) [`f465840`](https://github.com/cloudflare/workers-sdk/commit/f46584035cc18eef3bc40b26131cc00666ab4e11) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Remove the interpolation search experiment for asset manifest reading

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
