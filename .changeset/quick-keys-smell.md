---
"wrangler": patch
---

Prevent overlapping custom builds in `wrangler dev` and respect `jsx_fragment` settings

`wrangler dev` now serializes custom build executions triggered by bursty file watcher events so it no longer runs multiple overlapping custom builds for the same project state.

Custom-build bundling in dev now also passes the configured `jsx_fragment` value correctly instead of reusing `jsx_factory`, which fixes JSX fragment compilation for projects that set both options.
