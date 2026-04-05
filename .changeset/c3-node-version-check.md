---
"create-cloudflare": patch
---

Show a clear error message when running on an unsupported Node.js version

Previously, running `create-cloudflare` on an older Node.js version (e.g. v18) would fail with a confusing syntax error. Now, a dedicated version check runs before loading the CLI and displays a helpful message explaining the minimum required Node.js version and suggesting version managers like Volta or nvm.
