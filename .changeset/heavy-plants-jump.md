---
"wrangler": patch
---

feat: source-map function names

Following on from https://github.com/cloudflare/wrangler2/pull/1535, using new functionality from esbuild v0.14.50 of generation of `names` field in generated sourcemaps, we output the original function name in the stack trace.
