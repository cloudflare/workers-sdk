---
"@cloudflare/workers-utils": minor
---

Add a focused configuration entry point and deprecate root configuration imports

Import configuration APIs and types from `@cloudflare/workers-utils/config`, including the new `readConfig()` helper for reading, validating and normalizing Wrangler configuration with a caller-provided logger. The entry point also provides configuration discovery, defaults, validation, diagnostics, editing, formatting and binding interpretation helpers.

Existing configuration exports from `@cloudflare/workers-utils` remain available as deprecated compatibility aliases with the same runtime values and underlying types. Change their import specifier to `@cloudflare/workers-utils/config`; no previously published exports are removed.
