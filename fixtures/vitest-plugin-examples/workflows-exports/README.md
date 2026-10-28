# 🔁 workflows-exports

This Worker declares a `GreetingWorkflow` in the `exports` of `cloudflare.config.ts`. It has no binding, so the Worker reaches it through `ctx.exports.GreetingWorkflow`.

`introspectWorkflow()` needs a Workflow binding, so `vitest.config.ts` adds a test-only binding to the same Workflow. Instances created through `ctx.exports` are introspected too.

| Test                                    | Overview                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| [exports.test.ts](test/exports.test.ts) | Runs the Workflow through `ctx.exports`, and introspects it through a test-only binding. |
