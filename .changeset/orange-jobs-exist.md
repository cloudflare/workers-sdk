---
"wrangler": patch
---

fix: print wrangler banner at the start of every d1 command

This PR adds a wrangler banner to the start of every D1 command (except when invoked in JSON-mode)

For example:

```
 ⛅️ wrangler 3.27.0
-------------------
...
```
