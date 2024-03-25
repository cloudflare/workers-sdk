---
"wrangler": patch
---

fix: better handle dashes and other invalid JS identifier characters in `wrangler types` generation for vars, bindings, etc.

Previously, with the follwing in your `wrangler.toml`, an invalid types file would be generated:

```toml
[vars]
some-var = "foobar"
```

Now, the generated types file will be valid:

```typescript
interface Env {
	"some-var": "foobar";
}
```
