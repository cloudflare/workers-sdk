---
"wrangler": patch
---

chore: remove d1 local hardcoding

Prior to this change wrangler would only ever use local mode when testing d1.

After this change d1 tests can access both local and remote Workers.
