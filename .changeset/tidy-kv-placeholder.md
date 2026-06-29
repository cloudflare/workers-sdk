---
"wrangler": patch
---

Replace existing bindings when adding newly created resources to Wrangler configuration

When config updates are authorized interactively or through `--update-config` or `--binding`, Wrangler now replaces an existing resource binding with the selected name instead of adding a duplicate entry. This allows template bindings with placeholder resource IDs to be updated in both interactive and non-interactive workflows.
