---
"wrangler": patch
---

feat: add support for publishing workers with r2 bucket bindings

This change adds the ability to define bindings in your `wrangler.toml` file
for R2 buckets. These buckets will then be available in the environment
passed to the worker at runtime.

Closes #365
