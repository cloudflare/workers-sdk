---
"wrangler": patch
---

feat: allow specifying a path with unstable_dev fetch

Allows to specify a path in `unstable_dev`.

```
const worker = await unstable_dev(
  "script.js", {}, {}
);
const res = await worker.fetch(req);
```

where `req` can be anything from `RequestInfo`: `string | URL | Request`.
