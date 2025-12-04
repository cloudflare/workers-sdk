---
"create-cloudflare": minor
---

Add template string substitution in wrangler config files.

The value `"<WORKER_NAME>"` will be replaced by the project name when wrangler create a config file (in all of the toml, json, and jsonc formats).
