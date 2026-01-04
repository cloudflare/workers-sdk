---
"create-cloudflare": patch
---

Enable nodejs_compat by default for all new projects

All JavaScript and TypeScript projects created by C3 now have the `nodejs_compat` compatibility flag enabled by default. This makes it easier to get started with npm packages that rely on Node.js APIs, and removes extra setup steps needed for products like Hyperdrive and database drivers.

To disable Node.js compatibility, remove `nodejs_compat` from the `compatibility_flags` array in your wrangler configuration file.
