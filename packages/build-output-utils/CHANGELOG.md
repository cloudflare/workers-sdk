# @cloudflare/build-output-utils

## 0.3.1

### Patch Changes

- Updated dependencies [[`3650d29`](https://github.com/cloudflare/workers-sdk/commit/3650d29f1cfcd6db103c25d22819e8fe41d592f3)]:
  - @cloudflare/config@0.9.0

## 0.3.0

### Minor Changes

- [#15371](https://github.com/cloudflare/workers-sdk/pull/15371) [`e9df120`](https://github.com/cloudflare/workers-sdk/commit/e9df1204238ba26ed0e065b5bf441cfa4b4e683a) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Support multiple named Workers in the experimental Build Output utilities

  Build Output paths and config writing can now target any named Worker directory, and reading Build Output returns every Worker keyed by its directory name. `writeWorkerConfig` now accepts a single options object.

## 0.2.0

### Minor Changes

- [#15326](https://github.com/cloudflare/workers-sdk/pull/15326) [`9fcb1c9`](https://github.com/cloudflare/workers-sdk/commit/9fcb1c9c0a8a0edee04675c4446cd88b34c85b8a) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Record the selected mode in the Build Output Specification top-level `config.json`

  The mode a build was produced in is now written to `.cloudflare/output/v0/config.json` as a `mode` field, alongside the account and compliance settings.

- [#15326](https://github.com/cloudflare/workers-sdk/pull/15326) [`9fcb1c9`](https://github.com/cloudflare/workers-sdk/commit/9fcb1c9c0a8a0edee04675c4446cd88b34c85b8a) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Rename the top-level config accessors after the config they operate on

  `getRootConfigPath` and `writeRootConfig` are now `getSettingsConfigPath` and `writeSettingsConfig`, and the corresponding validation error reads `invalid settings config` rather than `invalid root config`.

### Patch Changes

- Updated dependencies [[`ead8f69`](https://github.com/cloudflare/workers-sdk/commit/ead8f69e85efa758dd066b4d1cfc2fec406939dd), [`9fcb1c9`](https://github.com/cloudflare/workers-sdk/commit/9fcb1c9c0a8a0edee04675c4446cd88b34c85b8a), [`9fcb1c9`](https://github.com/cloudflare/workers-sdk/commit/9fcb1c9c0a8a0edee04675c4446cd88b34c85b8a), [`82d11fc`](https://github.com/cloudflare/workers-sdk/commit/82d11fca0c826ef54000e5fbe1dc87db73a5ef9c), [`7f66836`](https://github.com/cloudflare/workers-sdk/commit/7f668362bd5675afb95c1cb5128fad6aa092a430), [`acb14d0`](https://github.com/cloudflare/workers-sdk/commit/acb14d01d64f21f0f21c247da7c2fcb0557ebb3d)]:
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
