---
"miniflare": patch
---

Honor the source-map setting in release builds

Omit Miniflare's own source maps when building with `SOURCEMAPS=false`, reducing the installed package size. Development builds continue to include self-contained source maps, and source maps for user Workers remain supported.
