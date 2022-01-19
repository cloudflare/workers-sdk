---
"wrangler": patch
---

fix: ensure `kv:key list` matches the output from Wrangler 1

The previous output was passing an array of objects to console.log, which ended up showing something like

```
[Object object]
[Object object]
...
```

Now the result is JSON stringified before being sent to the console.
The tests have been fixed to check this too.
