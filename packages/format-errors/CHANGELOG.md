# format-errors

## 0.0.8

### Patch Changes

- [#12753](https://github.com/cloudflare/workers-sdk/pull/12753) [`ea8b1a4`](https://github.com/cloudflare/workers-sdk/commit/ea8b1a4619b663598f03d72760090f5e67827d05) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Replace deprecated `promjs` library with `MetricsRegistry` from `@cloudflare/workers-utils/prometheus-metrics`

  The `promjs` library has been unmaintained since 2022 and has a broken `package.json` requiring workarounds. It has been replaced with a lightweight `MetricsRegistry` class in `@cloudflare/workers-utils/prometheus-metrics` that produces byte-identical Prometheus text exposition format output.

## 0.0.7

### Patch Changes

- [#12756](https://github.com/cloudflare/workers-sdk/pull/12756) [`c7d0d18`](https://github.com/cloudflare/workers-sdk/commit/c7d0d189a40bea786e0425f25d9aa15686f40e92) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Fix error formatting to reliably return fallback responses on failure

  Previously, if something went wrong while formatting a pretty error page, the failure could go unhandled, resulting in no response being returned to the user. Now, errors during formatting are properly caught, ensuring users always receive a 500 JSON fallback response.

## 0.0.6

### Patch Changes

- [#11217](https://github.com/cloudflare/workers-sdk/pull/11217) [`9ed1542`](https://github.com/cloudflare/workers-sdk/commit/9ed1542e854be65f7c03ed9596ec36767ce8aa36) Thanks [@penalosa](https://github.com/penalosa)! - Use toucan-js v4

## 0.0.5

### Patch Changes

- [#9649](https://github.com/cloudflare/workers-sdk/pull/9649) [`ec9b417`](https://github.com/cloudflare/workers-sdk/commit/ec9b417f8ed711e7b5044410e83d781f123a6a62) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - patch release to trigger a test release

## 0.0.4

### Patch Changes

- [#9033](https://github.com/cloudflare/workers-sdk/pull/9033) [`2c50115`](https://github.com/cloudflare/workers-sdk/commit/2c501151d3d1a563681cdb300a298b83862b60e2) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - chore: convert wrangler.toml files into wrangler.jsonc ones

## 0.0.3

### Patch Changes

- [#7143](https://github.com/cloudflare/workers-sdk/pull/7143) [`4d7ce6f`](https://github.com/cloudflare/workers-sdk/commit/4d7ce6fd9fc80a0920a97dae14726c79012337b1) Thanks [@emily-shen](https://github.com/emily-shen)! - chore: enable observability on our internal infra Workers + bots

## 0.0.2

### Patch Changes

- [#6046](https://github.com/cloudflare/workers-sdk/pull/6046) [`c643a81`](https://github.com/cloudflare/workers-sdk/commit/c643a8193a3c0739b33d3c0072ae716bc8f1565b) Thanks [@threepointone](https://github.com/threepointone)! - chore: Normalize more dependencies.

  Follow up to https://github.com/cloudflare/workers-sdk/pull/6029, this normalizes some more dependencies : `get-port`, `chalk`, `yargs`, `toucan-js`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `esbuild-register`, `hono`, `glob-to-regexp`, `@cloudflare/workers-types`

## 0.0.1

### Patch Changes

- [#5482](https://github.com/cloudflare/workers-sdk/pull/5482) [`1b7739e`](https://github.com/cloudflare/workers-sdk/commit/1b7739e0af99860aa063f01c0a6e7712ac072fdb) Thanks [@DaniFoldi](https://github.com/DaniFoldi)! - docs: show new Discord url everywhere for consistency. The old URL still works, but https://discord.cloudflare.com is preferred.
