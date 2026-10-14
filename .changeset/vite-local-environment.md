---
"@cloudflare/vite-plugin": major
---

Load local Worker secrets with Vite-compatible file resolution

The plugin now resolves declared Worker secrets from `.dev.vars` or Vite's `.env` file set using the resolved Vite mode and `envDir`. A mode-specific `.dev.vars.<mode>` file takes precedence over `.dev.vars`. When either file exists, declared Worker secrets are loaded exclusively from it instead of being merged with `.env` or `process.env` values. `vite preview` uses the Vite mode recorded in the Build Output.

The deprecated `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING_NAME>` environment variable is no longer supported. Use `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING_NAME>` instead.
