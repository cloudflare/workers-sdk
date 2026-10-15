---
"@cloudflare/vite-plugin": major
---

Load local Worker secrets with Vite-compatible file resolution

The plugin now uses Vite's resolved mode and `envDir` when locating files that provide declared Worker secrets.

`CLOUDFLARE_ENV` is no longer used to select mode-specific `.dev.vars` and `.env` files. Projects that relied on it should use Vite's `--mode` option instead. For preview, set the mode during `vite build`; `vite preview` uses the mode recorded in the Build Output.

The deprecated `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING_NAME>` environment variable is no longer supported. Rename Hyperdrive overrides to `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING_NAME>`.
