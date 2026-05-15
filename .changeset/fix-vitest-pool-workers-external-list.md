---
"@cloudflare/vitest-pool-workers": patch
---

Derive bundler externals from `package.json` and shrink the published bundle

The bundler's `external` list was previously hand-maintained and out of sync with `package.json` — `undici` and `semver` were both listed as external despite being only `devDependencies`. The published `dist/pool/index.mjs` consequently contained a top-level `import { fetch } from "undici"` that was only resolvable because pnpm happened to hoist `undici` from other packages' devDependencies during local development.

The bundler now derives its `external` list from `dependencies` + `peerDependencies` in `package.json`, making it impossible for a `devDependency` to silently end up externalized.

Combined with the new `"sideEffects": false` declaration in `@cloudflare/workers-utils`, the unused `cloudflared` / `tunnel` exports (and their transitive `undici` import) are now tree-shaken out of the pool entirely. `dist/pool/index.mjs` no longer references `undici` at all, and shrinks from ~489 KB to ~125 KB.
