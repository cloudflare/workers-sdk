---
"@cloudflare/local-explorer-ui": patch
---

Fix local explorer KV bulk / get for large payloads.

Fixes an issue where the local explorer UI would crash when fetching large KV payloads.

Additionally, the local KV bulk get API endpoint now enforces a total 25MB payload limit, in alignment with the remote Cloudflare API.
