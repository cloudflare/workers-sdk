---
"miniflare": patch
"wrangler": patch
---

fix: ensure `miniflare` and `wrangler` can source map in the same process

Previously, if in a `wrangler dev` session you called `console.log()` and threw an unhandled error you'd see an error like `[ERR_ASSERTION]: The expression evaluated to a falsy value`. This change ensures you can do both of these things in the same session.
