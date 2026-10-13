---
"@cloudflare/vite-plugin": minor
---

Generate source maps for Worker environments by default

Worker builds now emit source maps unless Vite's `build.sourcemap` or the Worker's `upload_source_maps` is set, so deployed Workers get stack traces that point at the original source. The source maps are written next to the Worker bundle and included in Build Output; the client environment is unchanged, so no source maps are added to public assets. Set `build.sourcemap: false` for the Worker environment, or `upload_source_maps: false` in the Worker config, to opt out.
