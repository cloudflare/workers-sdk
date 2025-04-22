---
"wrangler": minor
---

feat: add `config.keep_names` option

Adds a new option to Wrangler to allow developers to opt out of esbuild's `keep_names` option (https://esbuild.github.io/api/#keep-names). By default, Wrangler sets this to `true`

This is something developers should not usually need to care about, but sometimes
`keep_names` can create issues, and in such cases they will be now able to opt-out.

Example `wrangler.jsonc`:

```json
{
	"name": "my-worker",
	"main": "src/worker.ts",
	"keep_names": false
}
```
