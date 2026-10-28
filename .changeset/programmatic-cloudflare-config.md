---
"@cloudflare/vite-plugin": minor
---

Support programmatic project configuration in the experimental v2 Vite plugin

Add `projectConfig` for supplying complete configuration in memory, including account settings, Workers, and Containers, or an async factory receiving the mode and preview-build context. Frameworks can retain their own configuration surface without generating a separate `cloudflare.config.ts` file. File-based type generation is skipped when this option is provided.
