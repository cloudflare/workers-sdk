---
"@cloudflare/containers-shared": patch
"@cloudflare/deploy-helpers": patch
"@cloudflare/workers-auth": minor
"@cloudflare/workers-utils": patch
---

Use consumer-specific CLI names and commands in shared user-facing messages

Shared deployment, container, configuration, and authentication helpers can now render commands and configuration filenames for their calling CLI while preserving Wrangler-compatible defaults. This prevents `cf` workflows from presenting Wrangler-branded guidance when an equivalent `cf` command exists.
