# 📌 durable-objects-exports

This Worker mirrors the simple [`durable-objects`](../durable-objects/) fixture, but configures its Durable Objects via the declarative [`exports`](https://developers.cloudflare.com/durable-objects/reference/durable-object-exports) field in `wrangler.jsonc` instead of the legacy `migrations` array.

`Counter` is also declared as a regular binding under `durable_objects.bindings`. `UnboundCounter` has no binding and is reachable only via `ctx.exports.UnboundCounter` from inside the Worker — both forms must work for `exports` to be a full replacement for `migrations`.

`@cloudflare/vitest-pool-workers` enforces the `X_DO_EXPORTS` opt-in gate, so `vitest.config.ts` sets `process.env.X_DO_EXPORTS = "true"` at module load (before the cloudflareTest plugin runs and before the pool process forks).

| Test                                    | Overview                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| [exports.test.ts](test/exports.test.ts) | Bound + unbound DOs declared via `exports`, with SQLite storage and direct access. |
