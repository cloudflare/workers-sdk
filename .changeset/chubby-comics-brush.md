---
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Add keyboard shortcut to display worker bindings during development

When running `vite dev` or `vite preview`, you can now press `b + Enter` to display a list of all bindings configured for your Worker(s). This makes it easier to discover and verify which resources (e.g. KV namespaces, Durable Objects, environment variables, etc.) are available to your Worker during development.

This is the same functionality previously available in `wrangler dev` which is now integrated into the Vite plugin.
