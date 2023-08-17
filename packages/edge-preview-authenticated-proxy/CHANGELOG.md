# edge-preview-authenticated-proxy

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
