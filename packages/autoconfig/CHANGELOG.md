# @cloudflare/autoconfig

## 0.1.0

### Minor Changes

- [#14365](https://github.com/cloudflare/workers-sdk/pull/14365) [`f224ce2`](https://github.com/cloudflare/workers-sdk/commit/f224ce2009b6844a606eb53a71fb114434e8a7a0) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Add experimental package for framework autoconfig detection and configuration

- [#14365](https://github.com/cloudflare/workers-sdk/pull/14365) [`f224ce2`](https://github.com/cloudflare/workers-sdk/commit/f224ce2009b6844a606eb53a71fb114434e8a7a0) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Add support for React Router >= 8.0.0

  React Router v8 enables `viteEnvironmentApi` and `middleware` by default, so autoconfig no longer adds `future` flags to `react-router.config.ts` for v8+ projects and uses the middleware code pattern unconditionally.

### Patch Changes

- Updated dependencies [[`cfd6205`](https://github.com/cloudflare/workers-sdk/commit/cfd6205fe86f6afd74b5881f09524c93c83b8359), [`cfd6205`](https://github.com/cloudflare/workers-sdk/commit/cfd6205fe86f6afd74b5881f09524c93c83b8359)]:
  - @cloudflare/workers-utils@0.24.0
  - @cloudflare/cli-shared-helpers@0.1.10
