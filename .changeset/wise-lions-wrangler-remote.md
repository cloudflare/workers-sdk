---
"wrangler": patch
---

Establish remote binding proxy sessions via the new `@cloudflare/remote-bindings` package.

`wrangler dev`'s remote bindings now use a lightweight direct edge-preview client and a minimal local proxy instead of spinning up a full dev environment, while preserving wrangler's existing auth resolution and error reporting. There is no change to user-facing behaviour or configuration.
