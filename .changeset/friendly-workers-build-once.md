---
"@cloudflare/vite-plugin": patch
---

Avoid rebuilding environments already built in a pre `buildApp` hook

When another plugin builds a Worker or client environment in a `buildApp` hook with `order: "pre"`, the Cloudflare plugin now skips rebuilding that environment.

When using a custom `builder.buildApp`, the plugin now completes any required client build and makes assets imported by the entry Worker available to serve. Previously, custom builders skipped these steps.
