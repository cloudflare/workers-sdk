---
"wrangler": minor
---

Add experimental support for declarative Durable Object exports

`wrangler deploy` and `wrangler versions upload` now accept an `exports` map in `wrangler.json` / `wrangler.toml` as a declarative alternative to the legacy `migrations` array. The new flow is gated behind the `X_DO_EXPORTS` environment variable.

Each entry in `exports` is keyed by Durable Object class name. `type` carries the export _kind_ (currently always `"durable_object"`); the new `state` field carries the lifecycle and defaults to `"created"` (live) when omitted:

```jsonc
{
	"exports": {
		"MyDO": { "type": "durable_object", "storage": "sqlite" },
		"OldGone": { "type": "durable_object", "state": "deleted" },
		"OldName": {
			"type": "durable_object",
			"state": "renamed",
			"renamed_to": "NewName",
		},
		"Movee": {
			"type": "durable_object",
			"state": "transferred",
			"transfer_to_script": "target-worker",
		},
		"Incoming": {
			"type": "durable_object",
			"state": "expecting_transfer",
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

The upload response now surfaces the server's reconciliation result — created namespaces, applied tombstones, structured per-scenario info entries, and a `removable_entries` hint for stale tombstones that are safe to delete from the config. Blocking errors return the structured per-class detail with scenario tags, suggested remediation, and any referencing-script context.

Local development (`wrangler dev` and `unstable_startWorker`) reads Durable Object SQLite storage settings from the new `exports` field, so applications using the declarative flow get correct local-dev storage without needing to also declare a `migrations` block. Live entries (`state: "created"` and `state: "expecting_transfer"`) contribute the class to the local-dev DO map; tombstones do not. `wrangler dev` mirrors the deploy-side opt-in check: if `exports` is configured but `X_DO_EXPORTS` is not set, dev fails fast with the same actionable error so local sessions can't drift from production semantics.

`wrangler types` is also aware of `exports`. Live entries (including `expecting_transfer`, the receiving side of a two-phase transfer) are added to `Cloudflare.GlobalProps.durableNamespaces`, which types `ctx.exports.X` for unbound Durable Objects declared only via `exports`. Tombstones are excluded. Like `dev` and `deploy`, `wrangler types` is gated on `X_DO_EXPORTS` so the generated `.d.ts` surface cannot drift from the deploy / dev contract.

The validator's "no lifecycle declared" warning is now `exports`-aware: when the config already declares any `exports` entries, or when `X_DO_EXPORTS=true` is set, the warning suggests extending the `exports` map instead of recommending a `migrations` block.

This flow requires the `exports_reconciliation` account entitlement on Cloudflare's side and is hidden behind the experimental env var until that gate ships broadly. `migrations`-based deploys are unchanged.
