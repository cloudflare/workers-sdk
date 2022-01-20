---
"wrangler": patch
---

fix: check actual asset file size, not base64 encoded size

Previously we were checking whether the base64 encoded size of an asset was too large (>25MiB).
But base64 takes up more space than a normal file, so this was too aggressive.
