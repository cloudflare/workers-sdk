---
"miniflare": patch
---

fix: kv services name should be unique per persist path

This fix ensures that the KV and Secret Store plugin will create a dedicated object and storage service when they have a different persist path.
