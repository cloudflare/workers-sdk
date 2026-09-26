---
"wrangler": patch
---

Fix beta Preview onboarding writing invalid observability settings

Previously, the downstream API could return `null` for unset observability fields, causing Wrangler to write invalid configuration values. Wrangler now omits those fields while preserving meaningful `null` values in JSON bindings.
