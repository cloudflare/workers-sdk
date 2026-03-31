---
"@cloudflare/local-explorer-ui": patch
---

Fix local explorer invalid route messages.

When trying to access a route, like `/foo`, that doesn't exist we show a custom 404 error message with a redirect button.

Similarly we do the same for when trying to access a binding resource that doesn't exist. Now showing a "Resource not found" error with a redirect button.
