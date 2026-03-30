# edge-preview-authenticated-proxy

## 0.3.1

### Patch Changes

- [#12753](https://github.com/cloudflare/workers-sdk/pull/12753) [`ea8b1a4`](https://github.com/cloudflare/workers-sdk/commit/ea8b1a4619b663598f03d72760090f5e67827d05) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Replace deprecated `promjs` library with `MetricsRegistry` from `@cloudflare/workers-utils/prometheus-metrics`

  The `promjs` library has been unmaintained since 2022 and has a broken `package.json` requiring workarounds. It has been replaced with a lightweight `MetricsRegistry` class in `@cloudflare/workers-utils/prometheus-metrics` that produces byte-identical Prometheus text exposition format output.

- [#13021](https://github.com/cloudflare/workers-sdk/pull/13021) [`973dfdd`](https://github.com/cloudflare/workers-sdk/commit/973dfddd2d247c269e07fa503470357f612abf0e) Thanks [@penalosa](https://github.com/penalosa)! - Restore the `/exchange` preview session endpoint.

## 0.3.0

### Minor Changes

- [#12771](https://github.com/cloudflare/workers-sdk/pull/12771) [`b8c33f5`](https://github.com/cloudflare/workers-sdk/commit/b8c33f5509a202cf4d4ebe5bd38c5705dffd9346) Thanks [@penalosa](https://github.com/penalosa)! - Remove prewarm, inspector_websocket, and exchange proxy from preview flow

  The preview session exchange endpoint (`/exchange`) has been removed from the edge-preview-authenticated-proxy — it has been unused since the dash started fetching the exchange URL directly (DEVX-979). The `prewarm` parameter is no longer required or accepted by the `.update-preview-token` endpoint.

  The playground preview worker now treats `exchange_url` as optional, falling back to the initial token from the edge-preview API when exchange is unavailable. Inspector websocket proxying and prewarm have been removed in favour of using `tail_url` for live logs.

## 0.2.5

### Patch Changes

- [#11217](https://github.com/cloudflare/workers-sdk/pull/11217) [`9ed1542`](https://github.com/cloudflare/workers-sdk/commit/9ed1542e854be65f7c03ed9596ec36767ce8aa36) Thanks [@penalosa](https://github.com/penalosa)! - Use toucan-js v4

## 0.2.4

### Patch Changes

- [#9033](https://github.com/cloudflare/workers-sdk/pull/9033) [`2c50115`](https://github.com/cloudflare/workers-sdk/commit/2c501151d3d1a563681cdb300a298b83862b60e2) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - chore: convert wrangler.toml files into wrangler.jsonc ones

## 0.2.3

### Patch Changes

- [#7793](https://github.com/cloudflare/workers-sdk/pull/7793) [`9941219`](https://github.com/cloudflare/workers-sdk/commit/994121908de7b0537c06ed4f6bae6cb35d32521d) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: ensure no body is passed when constructing a GET or HEAD request to the preview worker

## 0.2.2

### Patch Changes

- [#7630](https://github.com/cloudflare/workers-sdk/pull/7630) [`b687dff`](https://github.com/cloudflare/workers-sdk/commit/b687dffa7cf9f77e553f475d6a400c3560a360e9) Thanks [@edmundhung](https://github.com/edmundhung)! - fix OPTIONS raw http request support by overriding raw request method with the X-CF-Http-Method header

## 0.2.1

### Patch Changes

- [#7143](https://github.com/cloudflare/workers-sdk/pull/7143) [`4d7ce6f`](https://github.com/cloudflare/workers-sdk/commit/4d7ce6fd9fc80a0920a97dae14726c79012337b1) Thanks [@emily-shen](https://github.com/emily-shen)! - chore: enable observability on our internal infra Workers + bots

## 0.2.0

### Minor Changes

- [#6458](https://github.com/cloudflare/workers-sdk/pull/6458) [`50a60a6`](https://github.com/cloudflare/workers-sdk/commit/50a60a69ee66499759d2f04459c1d182689efa64) Thanks [@penalosa](https://github.com/penalosa)! - feat: Optionally strip `cf-ew-raw-` prefix from headers before passing to the user worker

## 0.1.4

### Patch Changes

- [#6046](https://github.com/cloudflare/workers-sdk/pull/6046) [`c643a81`](https://github.com/cloudflare/workers-sdk/commit/c643a8193a3c0739b33d3c0072ae716bc8f1565b) Thanks [@threepointone](https://github.com/threepointone)! - chore: Normalize more dependencies.

  Follow up to https://github.com/cloudflare/workers-sdk/pull/6029, this normalizes some more dependencies : `get-port`, `chalk`, `yargs`, `toucan-js`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `esbuild-register`, `hono`, `glob-to-regexp`, `@cloudflare/workers-types`

## 0.1.3

### Patch Changes

- [#5100](https://github.com/cloudflare/workers-sdk/pull/5100) [`2713977`](https://github.com/cloudflare/workers-sdk/commit/27139771cc5463da42df78c7f560a6004aac5db1) Thanks [@penalosa](https://github.com/penalosa)! - fix: Handle multiple set cookie headers

## 0.1.2

### Patch Changes

- [#3722](https://github.com/cloudflare/workers-sdk/pull/3722) [`c220a5fe`](https://github.com/cloudflare/workers-sdk/commit/c220a5feadf5ebe7365b1e13c5f0cbeb3fad46e4) Thanks [@1000hz](https://github.com/1000hz)! - No longer included the preview token twice in rawhttp requests

## 0.1.1

### Patch Changes

- [#3448](https://github.com/cloudflare/workers-sdk/pull/3448) [`acc9881b`](https://github.com/cloudflare/workers-sdk/commit/acc9881b92245b4b4a7dac1eade1cb7782a4a7c6) Thanks [@1000hz](https://github.com/1000hz)! - fix: Allowed arbitrary headers on cross-origin requests to Raw HTTP preview.

  Requests sent to the rawhttp preview endpoint with arbitrary headers were being blocked due to same-origin policy.
  We now include any request headers as part of `Access-Control-Allow-Headers` in the preflight response.

## 0.1.0

### Minor Changes

- [#2958](https://github.com/cloudflare/workers-sdk/pull/2958) [`a0233c66`](https://github.com/cloudflare/workers-sdk/commit/a0233c6677579b53d73c3e860f1a90ffb8fbb076) Thanks [@penalosa](https://github.com/penalosa)! - feat: Add a worker to provide an authenticated proxy to the edge preview environment.
