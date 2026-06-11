---
"wrangler": minor
---

Add auto-config binding prompt to `pipelines streams create` and `pipelines setup`

After creating a stream, wrangler now shows the correct `wrangler.json` binding snippet and offers to add it to your config file automatically — matching the behavior of `kv namespace create`, `d1 create`, and other resource-creation commands. The `--binding`, `--update-config`, and `--use-remote` flags are also supported for non-interactive use.

The binding snippet now uses the `stream` field instead of the deprecated `pipeline` field.
