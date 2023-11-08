---
"miniflare": patch
---

fix: reject `Miniflare#ready` promise if `Miniflare#dispose()` called while waiting
