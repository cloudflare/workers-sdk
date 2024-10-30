---
"wrangler": minor
---

Update import resolution for files and package exports

In an npm workspace environment, wrangler will now be able to successfully resolve package exports.

Previously, wrangler would only be able to resolve modules in a relative `node_modules` directory and not the workspace root `node_modules` directory.
