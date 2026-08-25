# @cloudflare/build-output-utils

## 0.2.0

### Minor Changes

- [#15355](https://github.com/cloudflare/workers-sdk/pull/15355) [`e56d2e6`](https://github.com/cloudflare/workers-sdk/commit/e56d2e671b1db7381c9f65788b918ec953bd543f) Thanks [@penalosa](https://github.com/penalosa)! - Record the selected mode in the Build Output Specification top-level `config.json`

  The mode a build was produced in is now written to `.cloudflare/output/v0/config.json` as a `mode` field, alongside the account and compliance settings.

- [#15355](https://github.com/cloudflare/workers-sdk/pull/15355) [`e56d2e6`](https://github.com/cloudflare/workers-sdk/commit/e56d2e671b1db7381c9f65788b918ec953bd543f) Thanks [@penalosa](https://github.com/penalosa)! - Rename the top-level config accessors after the config they operate on

  `getRootConfigPath` and `writeRootConfig` are now `getSettingsConfigPath` and `writeSettingsConfig`, and the corresponding validation error reads `invalid settings config` rather than `invalid root config`.

### Patch Changes

- Updated dependencies [[`e56d2e6`](https://github.com/cloudflare/workers-sdk/commit/e56d2e671b1db7381c9f65788b918ec953bd543f), [`e56d2e6`](https://github.com/cloudflare/workers-sdk/commit/e56d2e671b1db7381c9f65788b918ec953bd543f), [`e56d2e6`](https://github.com/cloudflare/workers-sdk/commit/e56d2e671b1db7381c9f65788b918ec953bd543f), [`e56d2e6`](https://github.com/cloudflare/workers-sdk/commit/e56d2e671b1db7381c9f65788b918ec953bd543f), [`e56d2e6`](https://github.com/cloudflare/workers-sdk/commit/e56d2e671b1db7381c9f65788b918ec953bd543f), [`e56d2e6`](https://github.com/cloudflare/workers-sdk/commit/e56d2e671b1db7381c9f65788b918ec953bd543f)]:
  - @cloudflare/config@0.8.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`59872c4`](https://github.com/cloudflare/workers-sdk/commit/59872c41d4417d9b8c2efddb4b35662453efcaae), [`99a1f49`](https://github.com/cloudflare/workers-sdk/commit/99a1f49d7c037a25d4a19a3fe3054337e7201864), [`99a1f49`](https://github.com/cloudflare/workers-sdk/commit/99a1f49d7c037a25d4a19a3fe3054337e7201864), [`99a1f49`](https://github.com/cloudflare/workers-sdk/commit/99a1f49d7c037a25d4a19a3fe3054337e7201864)]:
  - @cloudflare/config@0.7.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`6529f0c`](https://github.com/cloudflare/workers-sdk/commit/6529f0ca5ecda93f67efbaa72a7f9a9f8fd814bf)]:
  - @cloudflare/config@0.6.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`2194f88`](https://github.com/cloudflare/workers-sdk/commit/2194f888e53a987ee12c75f1f58f5af287e3c8a3)]:
  - @cloudflare/config@0.5.0

## 0.1.0

### Minor Changes

- [#14905](https://github.com/cloudflare/workers-sdk/pull/14905) [`b21eac2`](https://github.com/cloudflare/workers-sdk/commit/b21eac24878f060296915f198fae910268c465ef) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Move build output utils to new `@cloudflare/build-output-utils` package

### Patch Changes

- Updated dependencies [[`b21eac2`](https://github.com/cloudflare/workers-sdk/commit/b21eac24878f060296915f198fae910268c465ef)]:
  - @cloudflare/config@0.4.0
