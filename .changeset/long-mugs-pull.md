---
"wrangler": minor
---

feat: add `config.keep_names` option

adds a new option so that developers can opt out of esbuild's `keep_names` option
(see: https://esbuild.github.io/api/#keep-names) which wrangler otherwise sets
to `true`

this is something developers should not usually need to care about, but sometimes
`keep_names` can create issues, in such cases they will be now able to set opt
out of it

example `wrangler.jsonc`:

```json
{
	"name": "my-worker",
	"main": "src/worker.ts",
	"compatibility_flags": ["nodejs_compat"],

	"minify": false
}
```
