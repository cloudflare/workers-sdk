---
"wrangler": patch
---

Keep Pages development asset lookups within the configured directory

Validate resolved asset paths relative to the Pages output directory, preventing neighboring files and directories with a shared name prefix from being served. This also applies to the Vitest Pages ASSETS helper. Assets inside the directory and existing not-found fallbacks retain their behavior.
