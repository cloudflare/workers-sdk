---
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Add `secrets` config option for type-only secret declarations

You can now declare secret binding names in `wrangler.jsonc` / `wrangler.toml` using the same shape as `vars`: an object where keys are secret names and values are empty objects. These declarations are used only for type generation: they produce optional `string` properties on the generated `Env` interface (e.g. `WEBHOOK_SECRET?: string`). Actual secret values are set via `wrangler secret put` or the Dashboard; deploy never sends config `secrets` as bindings, so existing secret values are not overwritten.

Example in wrangler.jsonc:

```json
{
  "vars": { "PUBLIC_KEY": "abc" },
  "secrets": {
    "WEBHOOK_SECRET": {},
    "GITHUB_PATS": {}
  }
}
```

Run `wrangler types` to regenerate `worker-configuration.d.ts` with optional secret keys on `Env`.
