---
"@cloudflare/vite-plugin": patch
---

Expose the options passed to `cloudflare()` as `api.pluginConfig` on the plugin

Tools that load a project's Vite config can now read the Cloudflare plugin's options from the `vite-plugin-cloudflare` plugin's `api.pluginConfig`, without re-parsing the config file. This is used to run the Vite plugin's playground tests against `@cloudflare/rsbuild-plugin`.
