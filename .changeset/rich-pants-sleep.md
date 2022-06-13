---
"wrangler": patch
---

polish: don't include folder name in Sites kv asset keys

As reported in https://github.com/cloudflare/wrangler2/issues/1189, we're including the name of the folder in the keys of the KV store that stores the assets. This doesn't match v1 behaviour. It makes sense not to include these since, we should be able to move around the folder and not have to reupload the entire folder again.

Fixes https://github.com/cloudflare/wrangler2/issues/1189
