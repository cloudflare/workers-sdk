# @cloudflare/autoconfig

## 0.2.0

### Minor Changes

- [#14595](https://github.com/cloudflare/workers-sdk/pull/14595) [`2b390d7`](https://github.com/cloudflare/workers-sdk/commit/2b390d7831ff27aa13cdf05aa8e11e4c0086f924) Thanks [@colinhacks](https://github.com/colinhacks)! - Recognise nub as a package manager

  wrangler now detects nub — from its `npm_config_user_agent` and an installed `nub` binary — and autoconfig detects nub projects by their `nub.lock`, alongside npm, pnpm, yarn, and bun.

### Patch Changes

- [#14534](https://github.com/cloudflare/workers-sdk/pull/14534) [`a330170`](https://github.com/cloudflare/workers-sdk/commit/a330170e8dfbe481a99597b3e07c1438e20f5ebb) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Preserve existing Nuxt `modules` when configuring a project for Cloudflare

  Configuring an existing Nuxt project whose `nuxt.config.ts` already declares a `modules` array previously overwrote that array when adding `nitro-cloudflare-dev`, dropping modules such as `@nuxt/ui`. Existing entries are now retained and the Cloudflare module is appended instead.

- Updated dependencies [[`2b390d7`](https://github.com/cloudflare/workers-sdk/commit/2b390d7831ff27aa13cdf05aa8e11e4c0086f924), [`a6c214f`](https://github.com/cloudflare/workers-sdk/commit/a6c214fb311215b1ed09b273171b7995033fb7d7)]:
  - @cloudflare/workers-utils@0.28.0
  - @cloudflare/cli-shared-helpers@0.1.16

## 0.1.6

### Patch Changes

- Updated dependencies [[`8cd805d`](https://github.com/cloudflare/workers-sdk/commit/8cd805db2f9901cba52d574b385577bafd595cb5)]:
  - @cloudflare/cli-shared-helpers@0.1.15
  - @cloudflare/workers-utils@0.27.0

## 0.1.5

### Patch Changes

- Updated dependencies [[`42df9bb`](https://github.com/cloudflare/workers-sdk/commit/42df9bbf07e37032a3e61027e33d504d74a25ccd)]:
  - @cloudflare/workers-utils@0.27.0
  - @cloudflare/cli-shared-helpers@0.1.14

## 0.1.4

### Patch Changes

- Updated dependencies [[`0283a1f`](https://github.com/cloudflare/workers-sdk/commit/0283a1fcdc635244f731010422e513e8b4ab0be3)]:
  - @cloudflare/workers-utils@0.26.0
  - @cloudflare/cli-shared-helpers@0.1.13

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
