---
"@cloudflare/rsbuild-plugin-workers": minor
---

Add experimental Rsbuild support for Cloudflare Workers

This introduces `@cloudflare/rsbuild-plugin-workers`, a new experimental plugin that reads Wrangler config, configures a Worker-focused Rsbuild environment, serves development requests through Miniflare, and emits deployable Wrangler output beside the compiled Worker bundle.
