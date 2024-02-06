---
"wrangler": patch
---

fix: make the entrypoint optional for the `types` command

Currently running `wrangler types` against a `wrangler.toml` file without a defined entrypoint (`main` value)
causes the command to error with the following message:

```
✘ [ERROR] Missing entry-point: The entry-point should be specified via the command line (e.g. `wrangler types path/to/script`) or the `main` config field.
```

However developers could want to generate types without the entrypoint being defined (for example when using `getBindingsProxy`), so these changes
make the entrypoint no longer mandatory for the `types` command, defaulting on assuming the use of the modules syntax if no entrypoint is specified.
