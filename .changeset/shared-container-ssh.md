---
"@cloudflare/containers-shared": patch
"wrangler": patch
---

Fix Container SSH connection setup and shutdown

Prevent SSH connections from stalling during setup and ensure proxy processes exit when sessions close.
