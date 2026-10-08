---
"@cloudflare/vite-plugin": patch
---

Honor the source-map setting in release builds

Omit the plugin's JavaScript and declaration source maps when building with `SOURCEMAPS=false`, reducing the installed package size. Normal development builds keep source maps, and application source-map settings are unchanged.
