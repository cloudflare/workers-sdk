---
"@cloudflare/vite-plugin": patch
---

Avoid rebuilding environments already built by another plugin

Use the `buildApp` hook to build only Worker and client environments that have not already been built. This prevents duplicate builds when framework plugins build environments first.

After a custom `builder.buildApp`, the plugin now also builds the client environment when needed and moves assets imported by the entry Worker into the client output. Previously, custom builders skipped these steps.
