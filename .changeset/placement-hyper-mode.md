---
"wrangler": minor
---

Add support for "hyper" placement mode with structured hint object

This change adds a new "hyper" mode to the `placement` configuration field. When using "hyper" mode, the `hint` property must be an object with `scheme` and `target` properties, rather than a string.

Example configuration:
```toml
[placement]
mode = "hyper"

[placement.hint]
scheme = "http"
target = "example.com"
```
