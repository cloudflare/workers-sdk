---
"@cloudflare/containers-shared": patch
"wrangler": patch
---

fix: resolve Dockerfile path relative to the Wrangler config path

This fixes a bug where Wrangler would not be able to find a Dockerfile if a Wrangler config path had been specified with the `--config` flag.
