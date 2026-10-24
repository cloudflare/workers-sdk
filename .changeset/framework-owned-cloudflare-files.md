---
"@cloudflare/vite-plugin": minor
"@cloudflare/build-output-utils": minor
"@cloudflare/containers-shared": minor
---

Support framework-owned Cloudflare configuration and generated directories

Add `projectConfig` to the Vite plugin for supplying complete configuration in memory, and `directory` for relocating build output, generated types, local state, and temporary files without changing the Vite project root. Frameworks can retain their own configuration surface without generating a second root configuration file. Existing defaults remain unchanged.

Build Output readers, writers, path helpers, and Container output preparation accept an optional `outputDirectory`, so framework build, preview, and deployment tooling can share the same versioned artifact tree.
