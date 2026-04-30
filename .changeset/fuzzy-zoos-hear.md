---
"wrangler": patch
---

Improve `config-schema.json` hover text in more editors

Wrangler now emits `markdownDescription` in `config-schema.json` alongside the existing `description` field. Editors that support rich JSON Schema hovers can use that markdown directly instead of rendering escaped links and formatting.
