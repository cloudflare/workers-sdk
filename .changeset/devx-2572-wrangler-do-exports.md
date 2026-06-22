---
"wrangler": minor
---

Add experimental support for declarative Durable Object exports

`wrangler deploy` now accepts an `exports` map in `wrangler.json` as a declarative alternative to the legacy `migrations` array. The new flow is gated behind the `X_DO_EXPORTS` environment variable.

Each entry in `exports` is keyed by Durable Object class name. `type` carries the export _kind_ (currently always `"durable-object"`); the `state` field carries the lifecycle and defaults to `"created"` (live) when omitted:

```jsonc
{
	"exports": {
		"MyDO": { "type": "durable-object", "storage": "sqlite" },
		"OldGone": { "type": "durable-object", "state": "deleted" },
		"OldName": {
			"type": "durable-object",
			"state": "renamed",
			"renamed_to": "NewName",
		},
		"Movee": {
			"type": "durable-object",
			"state": "transferred",
			"transferred_to": "target-worker",
		},
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

The upload response now surfaces the server's reconciliation result — created namespaces, applied tombstones, structured per-scenario info entries, and a `removable_entries` hint for stale tombstones that are safe to delete from the config. Blocking errors return the structured per-class detail with scenario tags, suggested remediation, and any referencing-script context.

Local development (`wrangler dev` and `unstable_startWorker`) reads Durable Object SQLite storage settings from the new `exports` field, so applications using the declarative flow get correct local-dev storage without needing to also declare a `migrations` block. Live entries (`state: "created"` and `state: "expecting-transfer"`) contribute the class to the local-dev DO map; tombstones do not. `wrangler dev` mirrors the deploy-side opt-in check: if `exports` is configured but `X_DO_EXPORTS` is not set, dev fails fast with the same actionable error so local sessions can't drift from production semantics.

`wrangler types` is also aware of `exports`. Live entries (including `expecting-transfer`, the receiving side of a two-phase transfer) are added to `Cloudflare.GlobalProps.durableNamespaces`, which types `ctx.exports.X` for unbound Durable Objects declared only via `exports`. Tombstones are excluded. Like `dev` and `deploy`, `wrangler types` is gated on `X_DO_EXPORTS` so the generated `.d.ts` surface cannot drift from the deploy / dev contract.

The validator's "no lifecycle declared" warning is now `exports`-aware: when the config already declares any `exports` entries, or when `X_DO_EXPORTS=true` is set, the warning suggests extending the `exports` map instead of recommending a `migrations` block.

This flow requires the `exports_reconciliation` account entitlement on Cloudflare's side and is hidden behind the experimental env var until that gate ships broadly. `migrations`-based deploys are unchanged.

Like the legacy `migrations` array, the declarative `exports` map is a Durable Object lifecycle configuration and can only be applied via `wrangler deploy`. `wrangler versions upload` cannot apply DO lifecycle changes — see https://developers.cloudflare.com/workers/configuration/versions-and-deployments/#durable-object-migrations. Inside `wrangler deploy`, configs that declare `exports` are routed through the legacy PUT `/workers/scripts/:name` endpoint (the same path used today when `migrations` is set), which means a single `wrangler deploy` invocation does not support gradual rollouts when `exports` is set — exactly mirroring the existing `migrations` behaviour.

The two-phase cross-script transfer flow (`expecting-transfer` on the target, `transferred` on the source) is supported end-to-end. The recommended rollout is a four-deploy sequence:

1. **Source** deploys `Widget` as a normal live `durable-object` export (`state: "created"`).
2. **Target** deploys `state: "expecting-transfer"` with `transfer_from: "<source>"`. The receiving class is declared in code, but the target does **not** add a `durable_objects.bindings` entry for it yet — EWC's binding resolver does not yet route self-referential bindings through the source's namespace during phase 1. Reconciliation records a pending transfer and emits a `Transfer pending` info entry.
3. **Source** deploys the `state: "transferred"` tombstone with `transferred_to: "<target>"`. Reconciliation commits the handoff and emits `Transferred (committed)`; the namespace now belongs to the target.
4. **Target** redeploys with the `durable_objects.bindings` entry for the class. The binding resolves cleanly because the namespace is now on this script.
