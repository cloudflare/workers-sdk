# edge-preview-authenticated-proxy

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
