# @cloudflare/build-output-utils

## 0.7.1

### Patch Changes

- Updated dependencies [[`ec5251a`](https://github.com/cloudflare/workers-sdk/commit/ec5251a92f561dbbba77694ac954d85298f44039)]:
  - @cloudflare/config@0.17.0

## 0.7.0

### Minor Changes

- [#15713](https://github.com/cloudflare/workers-sdk/pull/15713) [`3c75cad`](https://github.com/cloudflare/workers-sdk/commit/3c75cad95ce8dc80973d4aba33a59a406f791e63) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Identify experimental Build Output resource configs by filename and location

  The root remains `config.json`, Worker configs are now `worker.config.json`, and Container configs are now `container.config.json`. Resource configs no longer contain top-level `type` discriminators, while settings and build context are stored together in the root config.

- [#15471](https://github.com/cloudflare/workers-sdk/pull/15471) [`0751490`](https://github.com/cloudflare/workers-sdk/commit/0751490b357fc85022dbc9ff5e6642c0f33a2f0a) Thanks [@edmundhung](https://github.com/edmundhung)! - Fix cf builds for static projects that serve assets from the project root

  The experimental Build Output path now omits the reserved `.cloudflare` directory when the project root is used for static assets. This prevents recursive output copying in Wrangler while preserving the existing behaviour for other asset directories.

### Patch Changes

- Updated dependencies [[`3c75cad`](https://github.com/cloudflare/workers-sdk/commit/3c75cad95ce8dc80973d4aba33a59a406f791e63), [`3c75cad`](https://github.com/cloudflare/workers-sdk/commit/3c75cad95ce8dc80973d4aba33a59a406f791e63)]:
  - @cloudflare/config@0.16.0

## 0.6.0

### Minor Changes

- [#15701](https://github.com/cloudflare/workers-sdk/pull/15701) [`643e5cc`](https://github.com/cloudflare/workers-sdk/commit/643e5ccb9e2ad7d85966af241e001465c0e1b1c6) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Pass Preview intent to `defineWorker` and upload its resolved configuration

  Preview builds now evaluate programmatic Worker configuration with `ctx.isPreview` set to `true` and record that intent in Build Output. The shared Preview uploader deploys the resolved bindings and settings while preserving configured Preview base values when it creates a Preview.

### Patch Changes

- Updated dependencies [[`1f070c8`](https://github.com/cloudflare/workers-sdk/commit/1f070c8a5a0b12247071551ed58d19444a427036), [`643e5cc`](https://github.com/cloudflare/workers-sdk/commit/643e5ccb9e2ad7d85966af241e001465c0e1b1c6)]:
  - @cloudflare/config@0.15.0

## 0.5.2

### Patch Changes

- Updated dependencies [[`6874aa9`](https://github.com/cloudflare/workers-sdk/commit/6874aa978144469927831de59834e8cdc47a5114)]:
  - @cloudflare/config@0.14.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`ca71205`](https://github.com/cloudflare/workers-sdk/commit/ca71205bb45d9182e6c748e7097baed67739a891)]:
  - @cloudflare/config@0.13.0

## 0.5.0

### Minor Changes

- [#15605](https://github.com/cloudflare/workers-sdk/pull/15605) [`c846bd8`](https://github.com/cloudflare/workers-sdk/commit/c846bd8f0f27da59a77406c516fab0431c38740e) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Add support for reading and writing Container configs in build output

  Container configs can now be written to and read from the Build Output Specification.

### Patch Changes

- Updated dependencies [[`3f42b10`](https://github.com/cloudflare/workers-sdk/commit/3f42b10a40d2b3aae1d8d5142ea0bc3ac58fa954)]:
  - @cloudflare/config@0.12.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`9c60d14`](https://github.com/cloudflare/workers-sdk/commit/9c60d14c0e4cd9306a58c830023f5b43fe6ed054)]:
  - @cloudflare/config@0.11.0

## 0.4.0

### Minor Changes

- [#15388](https://github.com/cloudflare/workers-sdk/pull/15388) [`10d6bfb`](https://github.com/cloudflare/workers-sdk/commit/10d6bfbaf0ab7466892f4d97af1301494ca71e37) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Support partial manifests in the experimental Build Output Specification

  Build output producers now declare whether their module inventory is complete. `readBuildOutput()` resolves partial manifests by discovering `.js`, `.mjs`, and `.map` files while preserving explicit module type overrides.

### Patch Changes

- Updated dependencies [[`ea28cc3`](https://github.com/cloudflare/workers-sdk/commit/ea28cc33e5d39031e9bf512e17f3a57cccbd3f46), [`10d6bfb`](https://github.com/cloudflare/workers-sdk/commit/10d6bfbaf0ab7466892f4d97af1301494ca71e37)]:
  - @cloudflare/config@0.10.0

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
