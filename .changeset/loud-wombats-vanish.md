---
"wrangler": patch
---

polish: add a deprecation warning to `--inspect` on `dev`

We have a blogposts and docs that says you need to pass `--inspect` to use devtools and/or profile your Worker. In wrangler v2, we don't need to pass the flag anymore. Using it right now will throw an error, so this patch makes it a simple warning instead.
