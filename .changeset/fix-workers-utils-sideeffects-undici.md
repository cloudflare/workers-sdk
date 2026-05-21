---
"@cloudflare/workers-utils": patch
---

Mark `@cloudflare/workers-utils` as side-effect-free and properly declare `undici` as a runtime dependency

The package now declares `"sideEffects": false` in its `package.json` so that downstream bundlers can tree-shake unused exports. In particular, consumers that only use a subset of the package (for example, `getTodaysCompatDate` from the main entry) will no longer carry the `cloudflared` / `tunnel` exports — or their transitive dependencies — in their final bundle.

`undici` has been moved from `devDependencies` to `dependencies`. Previously it was incorrectly listed as a devDependency while the bundler config marked it as external, leaving the published `dist/index.mjs` with an unresolved `import { fetch } from "undici"` for anyone installing the package directly. `undici` is deliberately kept external (rather than bundled) so that downstream consumers don't end up with two copies of `undici` in their bundle — which would break `instanceof Request`/`Response`/`Headers` checks across the boundary and prevent `setGlobalDispatcher` / proxy configuration from applying to the bundled copy.

`vitest` has been added as an optional `peerDependency` because the `./test-helpers` sub-export uses `vitest`'s `vi`, `beforeEach`, and `afterEach` APIs at runtime; consumers that import from `./test-helpers` must have `vitest` installed themselves.
