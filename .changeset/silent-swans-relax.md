---
"pages-workerjs-and-functions-app": patch
"wrangler": patch
---

`wrangler pages dev` should prioritize `_worker.js`

When using a `_worker.js` file, the entire `/functions` directory should be ignored – this includes its routing and middleware characteristics. Currently `wrangler pages dev` does the reverse, by prioritizing
`/functions` over `_worker.js`. These changes fix the current behaviour.
