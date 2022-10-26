---
"wrangler": patch
---

feat: delete site/assets namespace when a worker is deleted

This patch deletes any site/asset kv namespaces associated with a worker when `wrangler delete` is used. It finds the namespace associated with a worker by using the names it would have otherwise used, and deletes it. It also does the same for the preview namespace that's used with `wrangler dev`.
