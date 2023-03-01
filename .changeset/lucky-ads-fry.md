---
"wrangler": patch
---

Enable bundling in Pages Functions by default.

We now enable bundling by default for a `functions/` folder and for an `_worker.js` in Pages Functions. This allows you to use external modules such as Wasm. You can disable this behavior in Direct Upload projects by using the `--no-bundle` argument in `wrangler pages publish` and `wrangler pages dev`.
