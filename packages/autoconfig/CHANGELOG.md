# @cloudflare/autoconfig

## 0.2.9

### Patch Changes

- Updated dependencies [[`59872c4`](https://github.com/cloudflare/workers-sdk/commit/59872c41d4417d9b8c2efddb4b35662453efcaae), [`c68f9cb`](https://github.com/cloudflare/workers-sdk/commit/c68f9cb866a2eae4416d20f584f733527189f18a), [`5c10e39`](https://github.com/cloudflare/workers-sdk/commit/5c10e398979c0a054f58dcf2751012cc99e977d2), [`39dcea6`](https://github.com/cloudflare/workers-sdk/commit/39dcea6c9362e2d651e3108fa769dbbc32db5a7b)]:
  - @cloudflare/workers-utils@0.34.0
  - @cloudflare/cli-shared-helpers@0.1.25

## 0.2.8

### Patch Changes

- Updated dependencies [[`fb6b51b`](https://github.com/cloudflare/workers-sdk/commit/fb6b51b87bf73edca9866bdf2d0810d7bf491108), [`1b73c87`](https://github.com/cloudflare/workers-sdk/commit/1b73c879c168dcc78b0f2657d04bc784b8af7da3)]:
  - @cloudflare/workers-utils@0.33.1
  - @cloudflare/cli-shared-helpers@0.1.24

## 0.2.7

### Patch Changes

- [#15123](https://github.com/cloudflare/workers-sdk/pull/15123) [`d0c976c`](https://github.com/cloudflare/workers-sdk/commit/d0c976c04ad890fcef56305ded11f1405e89273e) Thanks [@dependabot](https://github.com/apps/dependabot)! - Stop adding a redundant `nodejs_compat` flag to generated Wrangler configurations

  `create-cloudflare` and `wrangler setup` write today's date as the `compatibility_date`, and from `2026-08-04` that already enables `nodejs_compat`. Adding the flag as well made the generated project fail to start with "The compatibility flag nodejs_compat became the default as of 2026-08-04 so does not need to be specified anymore", so the flag is now only added for earlier compatibility dates.

  `create-cloudflare` also removes the flag when a template, or a framework's own scaffolder, already wrote it into a configuration that ends up using such a compatibility date, and still installs `@types/node` for these projects even though there is no longer a flag to detect them by.

  `wrangler setup` does the same for a `wrangler.json(c)` that is already in the project: it writes today's date over whatever date that configuration was written for, so a `nodejs_compat` it finds there is removed as part of writing the file.

- Updated dependencies [[`d0c976c`](https://github.com/cloudflare/workers-sdk/commit/d0c976c04ad890fcef56305ded11f1405e89273e)]:
  - @cloudflare/workers-utils@0.33.0
  - @cloudflare/cli-shared-helpers@0.1.23

## 0.2.6

### Patch Changes

- Updated dependencies [[`0aa8fa5`](https://github.com/cloudflare/workers-sdk/commit/0aa8fa5e12bc64facb4e9fece321a762269d0357)]:
  - @cloudflare/workers-utils@0.32.0
  - @cloudflare/cli-shared-helpers@0.1.22

## 0.2.5

### Patch Changes

- Updated dependencies [[`8cf78c8`](https://github.com/cloudflare/workers-sdk/commit/8cf78c83cb4c64be8b458d7bd618b47e7c6e7d25), [`6946da1`](https://github.com/cloudflare/workers-sdk/commit/6946da1123f3c8484af80ec4f5426c5fe0bbdb34)]:
  - @cloudflare/workers-utils@0.31.2
  - @cloudflare/cli-shared-helpers@0.1.21

## 0.2.4

### Patch Changes

- Updated dependencies [[`b5c083b`](https://github.com/cloudflare/workers-sdk/commit/b5c083bf601d71bad82ccc044df55ba4584085e2)]:
  - @cloudflare/workers-utils@0.31.1
  - @cloudflare/cli-shared-helpers@0.1.20

## 0.2.3

### Patch Changes

- Updated dependencies [[`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6)]:
  - @cloudflare/workers-utils@0.31.0
  - @cloudflare/cli-shared-helpers@0.1.19

## 0.2.2

### Patch Changes

- Updated dependencies [[`5e6556a`](https://github.com/cloudflare/workers-sdk/commit/5e6556a0c788679b6ac149ba3018a2cfd7cc73e9)]:
  - @cloudflare/workers-utils@0.30.0
  - @cloudflare/cli-shared-helpers@0.1.18

## 0.2.1

### Patch Changes

- Updated dependencies [[`552bcfc`](https://github.com/cloudflare/workers-sdk/commit/552bcfc8d44f8625b09dfd5d821c132b626cb7bb)]:
  - @cloudflare/workers-utils@0.29.0
  - @cloudflare/cli-shared-helpers@0.1.17

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
