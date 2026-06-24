---
"wrangler": minor
"@cloudflare/vite-plugin": "minor"
---

Add experimental support for declarative Durable Object exports

`wrangler deploy` now accepts an `exports` map in `wrangler.json` as a declarative alternative to the legacy `migrations` array.

Each entry in `exports` is keyed by Durable Object class name. `type` carries the export _kind_ (currently always `"durable-object"`); the `state` field carries the lifecycle and defaults to `"created"` (live) when omitted:

```jsonc
{
	"exports": {
		// Provision a new Durable Object class (`MyDO`)
		"MyDO": { "type": "durable-object", "storage": "sqlite" },
		// Delete Durable Object class (`OldGone`)
		"OldGone": { "type": "durable-object", "state": "deleted" },
		// Rename a Durable Object class (from `OldName` to `NewName`)
		"OldName": {
			"type": "durable-object",
			"state": "renamed",
			"renamed_to": "NewName",
		},
		"NewName": { "type": "durable-object", "storage": "sqlite" },
		// Transfer a Durable Object (`Outgoing`) to a new Worker (`target-worker`)
		"Outgoing": {
			"type": "durable-object",
			"state": "transferred",
			"transferred_to": "target-worker",
		},
		// Prepare to receive the transfer of a Durable Object (`Incoming`) from another Worker (`source-worker`)
		"Incoming": {
			"type": "durable-object",
			"state": "expecting-transfer",
			"storage": "sqlite",
			"transfer_from": "source-worker",
		},
	},
}
```

Set `X_DO_EXPORTS=true` to opt in:

```sh
X_DO_EXPORTS=true wrangler deploy
```

The deployment response now surfaces the server's reconciliation result — created namespaces, applied tombstones, structured per-scenario info entries, and a `removable_entries` hint for stale tombstones that are safe to delete from the config. Blocking errors return the structured per-class detail with scenario tags, suggested remediation, and any referencing-script context.

`wrangler versions upload` also forwards `exports` under the same `X_DO_EXPORTS=true` gate, but server-side support on the versions endpoint is still rolling out — today the server returns error 10061 ("Cannot create binding … configure a migration") when `exports` is sent via `wrangler versions upload`. Use `wrangler deploy` to apply `exports`-based lifecycle changes until the rollout completes.

Local development (`wrangler dev`, `vite dev` and `unstable_startWorker`) reads Durable Object SQLite storage settings from the new `exports` field, so applications using the declarative flow get correct local-dev storage without needing to also declare a `migrations` block.

`wrangler types` is also aware of `exports`. Live entries (including `expecting-transfer`, the receiving side of a two-phase transfer) are added to `Cloudflare.GlobalProps.durableNamespaces`, which types `ctx.exports.X` for unbound Durable Objects declared only via `exports`.

This new feature is gated behind the `X_DO_EXPORTS` environment variable until stabilized.
