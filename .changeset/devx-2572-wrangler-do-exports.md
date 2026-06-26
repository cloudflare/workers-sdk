---
"wrangler": minor
"@cloudflare/vite-plugin": "minor"
"@cloudflare/vitest-pool-workers": minor
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

`wrangler versions upload` also forwards `exports` under the same `X_DO_EXPORTS=true` gate. Declarative `exports` lifecycle changes are reconciled when the version is deployed (`wrangler versions deploy` or `wrangler deploy`), so a `versions upload` payload can declare new classes in `exports` without immediately provisioning them. An actor binding (`durable_objects.bindings`) to a class declared only in `exports` on the same `versions upload` is rejected with a clear error (code 100406) — the binding cannot be resolved until the namespace is provisioned. Either stage the new class via `ctx.exports.X` (no binding required) on `versions upload` and add the binding at deploy time, or use `wrangler deploy` to provision and bind in one step (the same constraint applies to the `migrations` flow).

Multi-version deploys (`wrangler versions deploy A@50% B@50%`) where the selected versions disagree on declarative `exports` are rejected server-side with a clear message: deploy the version that changes `exports` at 100% first, then run the percentage-split deploy. This prevents traffic on one branch routing to code that references unprovisioned or just-deleted DO namespaces. Single-version (100%) deploys are unaffected.

Local development (`wrangler dev`, `vite dev` and `unstable_startWorker`) reads Durable Object SQLite storage settings from the new `exports` field, so applications using the declarative flow get correct local-dev storage without needing to also declare a `migrations` block.

`@cloudflare/vitest-pool-workers` also picks up Durable Object configuration from `exports`, so tests against an `exports`-only Worker run with the correct local SQLite storage and can reach unbound Durable Object classes via `ctx.exports.X`. The `X_DO_EXPORTS` opt-in gate is enforced here too — set `X_DO_EXPORTS=true` (e.g. via `process.env.X_DO_EXPORTS = "true"` at the top of `vitest.config.ts`, before the `cloudflareTest` plugin runs) until the feature stabilises.

`wrangler types` is also aware of `exports`. Live entries (including `expecting-transfer`, the receiving side of a two-phase transfer) are added to `Cloudflare.GlobalProps.durableNamespaces`, which types `ctx.exports.X` for unbound Durable Objects declared only via `exports`.

This new feature is gated behind the `X_DO_EXPORTS` environment variable until stabilized.
