---
"miniflare": patch
---

Fix bulk `getWithMetadata` dropping metadata for present keys whose value is falsy (`0`, `false`, empty string). The bulk-get handler gated on the decoded value's truthiness instead of the key's presence, so falsy-but-present values were returned unwrapped instead of as `{ value, metadata }`.
