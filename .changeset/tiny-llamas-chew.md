---
"wrangler": patch
---

Fix "TypeError: Body is unusable: Body has already been read" when failing to exchange oauth code because of double `response.text()`.
