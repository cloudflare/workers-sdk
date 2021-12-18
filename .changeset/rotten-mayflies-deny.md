---
"wrangler": patch
---

Ensure that the name is added to the wrangler.toml file during init

The name of the worker was not included in the wrangler.toml.
Now it is added if the user specfies one at the command line, otherwise it is inferred from the current directory name.
