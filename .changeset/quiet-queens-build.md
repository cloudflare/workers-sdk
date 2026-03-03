---
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Add local dev validation for the experimental `secrets` configuration property

When the new `secrets` property is defined, `wrangler dev` and `vite dev` now validate secrets declared in `secrets.required`. When required secrets are missing from `.dev.vars` or `.env`/`process.env`, a warning is logged listing the missing secret names.

When `secrets` is defined, only the keys listed in `secrets.required` are loaded. Additional keys in `.dev.vars` or `.env` are excluded. If you are not using `.dev.vars`, keys listed in `secrets.required` are loaded from `process.env` as well as `.env`. The `CLOUDFLARE_INCLUDE_PROCESS_ENV` environment variable is therefore not needed when using this feature.

When `secrets` is not defined, the existing behavior is unchanged.

```jsonc
// wrangler.jsonc
{
	"secrets": {
		"required": ["API_KEY", "DB_PASSWORD"],
	},
}
```
