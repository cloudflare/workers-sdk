---
"wrangler": minor
---

Add vendored WASM workflow diagram parser for local dev visualization

Vendors a WASM build of the Workflows team's Rust visualizer-controller into wrangler to perform static analysis on bundled workflow source code. After each esbuild bundle, the parser extracts a DAG (Directed Acyclic Graph) representing the workflow's step structure and passes it through to miniflare for serving via the local explorer API. The WASM module is loaded lazily — only when a workflow diagram is requested — so there is no overhead for non-workflow commands.
