---
"@cloudflare/build-output-utils": minor
---

Rename the top-level config accessors after the config they operate on

`getRootConfigPath` and `writeRootConfig` are now `getSettingsConfigPath` and `writeSettingsConfig`, and the corresponding validation error reads `invalid settings config` rather than `invalid root config`.
