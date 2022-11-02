---
"wrangler": patch
---

Computing the name from binding response
Now the `vars` will be computed, example:
`[var.binding.name]: var.binding.text`

this will resolve the issue that was occurring with
generating a TOML with incorrect fields for the `vars` key/value pair.

resolves #2048
