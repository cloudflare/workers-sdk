---
"wrangler": patch
---

Use `--name` when generating Durable Object-managed Container app names

Previously, unnamed Durable Object-managed Containers used the Worker `name` from the config file when generating Container application names, even if `wrangler deploy --name` selected a different Worker name. Generated app names now follow the deploy-time Worker name while preserving explicitly configured Container names.
