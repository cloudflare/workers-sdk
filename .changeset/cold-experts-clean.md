---
"@cloudflare/vitest-pool-workers": minor
---

Add support for ctx.exports

It is now possible to access `ctx.exports` properties for the `main` (`SELF`) worker.

- Integration tests: in the `SELF` worker the `ctx.exports` object now contains the expected stubs to the exported entry-points.
- Unit tests: the object returned from `createExecutionContext()` has `exports` property that exposes the exports of the `SELF` worker.

Due to the dynamic nature of Vitest the integration relies upon guessing what the exports of the `main` Worker are by statically analyzing the Worker source using esbuild. In cases where it is not possible to infer the exports (for example, a wildcard re-export of a virtual module) it is possible to declare these in the vitest-pool-workers config via the `additionalExports` setting.
