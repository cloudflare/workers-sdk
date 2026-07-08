# @cloudflare/autoconfig

## 0.1.3

### Patch Changes

- [#14548](https://github.com/cloudflare/workers-sdk/pull/14548) [`383e679`](https://github.com/cloudflare/workers-sdk/commit/383e679b52e39dcb71cbbb66909218c008d9aac4) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Fix Vite version detection for vite+ projects during autoconfiguration

  vite+ installs `@voidzero-dev/vite-plus-core` under the `vite` npm alias, so the resolved `node_modules/vite/package.json` reports the wrapper's own version (e.g. `0.2.2`) rather than the underlying Vite version it bundles. This caused autoconfiguration to fail with an error claiming the Vite version was too old to be configured automatically. Autoconfiguration now detects the correct underlying Vite version for these projects.

- Updated dependencies [[`aad35b7`](https://github.com/cloudflare/workers-sdk/commit/aad35b79d07df1bb764a4a5912d6b4328a34474b), [`1ac96a1`](https://github.com/cloudflare/workers-sdk/commit/1ac96a14b7fb022acada114ab8793fe8a4ba79a5), [`1ca8d8f`](https://github.com/cloudflare/workers-sdk/commit/1ca8d8f0bbd012a1d65cabadf7b6987b252775e9)]:
  - @cloudflare/workers-utils@0.25.1
  - @cloudflare/cli-shared-helpers@0.1.12

## 0.1.2

### Patch Changes

- Updated dependencies [[`aa5d580`](https://github.com/cloudflare/workers-sdk/commit/aa5d5801450b7e4417bfdbd477f86de3a4bc6933)]:
  - @cloudflare/workers-utils@0.25.0
  - @cloudflare/cli-shared-helpers@0.1.11

## 0.1.1

### Patch Changes

- [#14368](https://github.com/cloudflare/workers-sdk/pull/14368) [`a55b29a`](https://github.com/cloudflare/workers-sdk/commit/a55b29a4ba8a24f4d539538e2bf38e6a7e5b8e52) Thanks [@penalosa](https://github.com/penalosa)! - Add repository URL to `@cloudflare/autoconfig`

## 0.1.0

### Minor Changes

- [#14365](https://github.com/cloudflare/workers-sdk/pull/14365) [`f224ce2`](https://github.com/cloudflare/workers-sdk/commit/f224ce2009b6844a606eb53a71fb114434e8a7a0) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Add experimental package for framework autoconfig detection and configuration

- [#14365](https://github.com/cloudflare/workers-sdk/pull/14365) [`f224ce2`](https://github.com/cloudflare/workers-sdk/commit/f224ce2009b6844a606eb53a71fb114434e8a7a0) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Add support for React Router >= 8.0.0

  React Router v8 enables `viteEnvironmentApi` and `middleware` by default, so autoconfig no longer adds `future` flags to `react-router.config.ts` for v8+ projects and uses the middleware code pattern unconditionally.

### Patch Changes

- Updated dependencies [[`cfd6205`](https://github.com/cloudflare/workers-sdk/commit/cfd6205fe86f6afd74b5881f09524c93c83b8359), [`cfd6205`](https://github.com/cloudflare/workers-sdk/commit/cfd6205fe86f6afd74b5881f09524c93c83b8359)]:
  - @cloudflare/workers-utils@0.24.0
  - @cloudflare/cli-shared-helpers@0.1.10
