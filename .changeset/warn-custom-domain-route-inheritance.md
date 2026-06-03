---
"wrangler": patch
---

Warn when a named environment silently inherits custom_domain routes from the top-level config

When an `env.<name>` block does not override `routes`, it inherits the top-level `routes` array. If that array contains entries with `custom_domain: true`, every deploy to the named environment will silently reassign the custom domain away from the top-level Worker and towards the env Worker, causing routing drift. Wrangler now emits a warning in this situation and suggests adding `"routes": []` to the env block to prevent inheritance.
