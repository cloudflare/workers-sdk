---
"wrangler": minor
"miniflare": minor
"@cloudflare/workers-utils": minor
---

Add Artifacts binding support to wrangler

You can now configure Artifacts bindings in your wrangler configuration:

```jsonc
// wrangler.jsonc
{
	"artifacts": [{ "binding": "MY_ARTIFACTS", "namespace": "default" }],
}
```

Type generation produces the correct `Artifacts` type reference from the workerd type definitions:

```ts
interface Env {
	MY_ARTIFACTS: Artifacts;
}
```
