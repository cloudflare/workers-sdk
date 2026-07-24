---
"wrangler": minor
---

Support an optional `jurisdiction` field on `kv_namespaces` bindings

The field is only read when the namespace is first provisioned; once an `id` exists the namespace is addressed by that `id` and the `jurisdiction` field is ignored.

```jsonc
{
	"kv_namespaces": [{ "binding": "MY_KV", "jurisdiction": "eu" }],
}
```
