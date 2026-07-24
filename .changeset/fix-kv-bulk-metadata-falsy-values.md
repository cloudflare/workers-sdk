---
"miniflare": patch
---

Fix bulk `getWithMetadata` dropping metadata for present keys whose value is falsy (`0`, `false`, empty string). Previously, calling `getWithMetadata` on such keys would return the raw value without its `{ value, metadata }` wrapper.
