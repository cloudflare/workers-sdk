---
"wrangler": minor
"miniflare": minor
---

Evaluate Flagship flags locally in `wrangler dev`

Flagship bindings used to always talk to your remote app. They now use a local flag store by default, so `wrangler dev` works offline and does not change production flags. The store starts empty, so flags fall back to the default you pass at the call site until you populate it.

Copy your remote flags into the local store with:

```sh
wrangler flagship flags pull <APP_ID>
```

`create`, `get`, `list`, `update`, `delete`, `enable`, `disable`, `set`, `rollout`, `split`, `evaluate`, and the `rules` commands accept `--local` to read and write that store instead of the remote app. They still default to remote.

To keep using the remote app during local development, set `remote: true` on the binding:

```jsonc
{
	"flagship": [{ "binding": "FLAGS", "app_id": "my-app", "remote": true }],
}
```

When Local Explorer is enabled, bound Flagship apps appear in the sidebar. You can list flags, create them, edit their description, variants, and default variant, toggle them, and evaluate them against the same local store. Targeting rules are editable too: build conditions, choose the variant each rule serves, add a percentage rollout, and reorder rules to change which one wins.
