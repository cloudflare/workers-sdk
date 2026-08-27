---
"@cloudflare/vite-plugin": major
"@cloudflare/workers-utils": minor
---

Load local Worker secrets with Vite-compatible file resolution

Vite plugin v2 now resolves declared Worker secrets from `.dev.vars` or Vite's `.env` file set using the resolved Vite mode and `envDir`. A mode-specific `.dev.vars` file takes precedence over the base file, and the selected `.dev.vars` file remains isolated from `.env` and process values.

Vite plugin v2 no longer supports the deprecated `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING_NAME>` environment variable. Use `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING_NAME>` instead.
