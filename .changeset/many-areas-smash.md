---
"@cloudflare/vite-plugin": minor
---

Add a post `buildApp` hook that builds Worker environments that haven't already been built.

This ensures that auxiliary Workers are included in the build when using full-stack frameworks that define their own `builder.buildApp` function. Note that this feature is not supported with Vite 6 as the `buildApp` hook was introduced in Vite 7.
