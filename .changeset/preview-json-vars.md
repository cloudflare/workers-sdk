---
"wrangler": patch
---

preserve native shape of non-string `vars` in worker previews

`wrangler preview` previously coerced every non-string entry in `previews.vars` (arrays, objects, numbers, booleans) into a `plain_text` binding via `JSON.stringify`, so at runtime the worker saw a literal string instead of the value declared in `wrangler.jsonc`. `wrangler deploy` already serializes non-string vars as `json` bindings so the Workers runtime parses them back into native JS values; previews now match.

Before:

```ts
// wrangler.jsonc — previews.vars
{ "ALLOWLIST": ["a@example.com", "b@example.com"] }
// runtime
typeof env.ALLOWLIST === "string" // true (was '["a@example.com","b@example.com"]')
```

After:

```ts
typeof env.ALLOWLIST === "object" // Array.isArray(env.ALLOWLIST) === true
```
