---
"miniflare": patch
---

Add Bun compatibility for WebSocket upgrades in development server

Miniflare's WebSocket fetch implementation now includes fallback handlers for the "open" and "error" events to support Bun runtime. Bun doesn't emit the "upgrade" or "unexpected-response" events from the ws package, which previously caused the development server to hang indefinitely when using the `--bun` flag with `@cloudflare/vite-plugin`.

This change maintains backward compatibility with Node.js while enabling Bun developers to use HMR (Hot Module Replacement) without relying on Node.js polyfills, taking full advantage of Bun's native performance benefits.

Fixes #11171
