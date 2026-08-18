---
"wrangler": minor
---

Use local Flagship flags in `wrangler dev` instead of always connecting to the remote app

Flagship bindings were always remote, even in local development. They now use Miniflare's local flag store by default, so `wrangler dev` no longer reads or depends on your remote Flagship app. The warning about Flagship always accessing remote resources has been removed.

The local store starts out empty, so flags fall back to the default value you pass at the call site until you populate it with `wrangler flagship flags pull`. To keep using your remote app, set `remote: true` on the binding:

```jsonc
{
	"flagship": [{ "binding": "FLAGS", "app_id": "my-app", "remote": true }],
}
```
