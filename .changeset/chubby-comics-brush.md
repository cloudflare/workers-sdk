---
"@cloudflare/vite-plugin": minor
---

Add keyboard shortcut to display Worker bindings during development

When running `vite dev` or `vite preview`, you can now press `b + Enter` to display a list of all bindings configured for your Worker(s). This makes it easier to discover and verify which resources (e.g. KV namespaces, Durable Objects, environment variables, etc.) are available to your Worker during development.

This feature requires `vite` version `7.2.7` or later.
