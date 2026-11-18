---
"miniflare": patch
---

Include the plugin registry's types in Miniflare's declaration bundle

Keep the plugin type import explicit so API Extractor includes it in the public declarations. This prevents an unresolved `./shared` import when checking a project with `skipLibCheck` disabled.
