---
"wrangler": minor
---

Allow deleting KV namespaces by name

You can now delete a KV namespace by providing its name as a positional argument:

```bash
wrangler kv namespace delete my-namespace
```

This aligns the delete command with the create command, which also accepts a namespace name.
The existing `--namespace-id` and `--binding` flags continue to work as before.
