---
"wrangler": patch
---

feat: make it possible to specify a path for `unstable_dev()`'s fetch method

```
const worker = await unstable_dev(
  "script.js"
);
const res = await worker.fetch(req);
```

where `req` can be anything from `RequestInfo`: `string | URL | Request`.
