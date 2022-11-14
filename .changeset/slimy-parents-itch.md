---
"wrangler": patch
---

Use the `main` entrypoint for dependencies when `node_compat` is enabled.

Previously, we would use the `"browser"` or `"worker"` entrypoint in a depedency's `package.json` for bundling.
Now, if the user enables Node compatability, we target the `"main"` entrypoint.
