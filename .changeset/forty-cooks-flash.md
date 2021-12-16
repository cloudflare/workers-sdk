---
"wrangler": patch
---

Error and exit if the `--type` option is used for the `init` command.

The `--type` option is no longer needed, nor supported.

The type of a project is implicitly javascript, even if it includes a wasm (e.g. built from rust).

Projects that would have had the `webpack` type need to be configured separately to have a custom build.
