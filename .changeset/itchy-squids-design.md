---
"wrangler": patch
---

Show an error when D1 migration commands are run without a configuration file

Previously, running `wrangler d1 migrations apply`, `wrangler d1 migrations list`, or `wrangler d1 migrations create` in a directory without a Wrangler configuration file would silently exit with no feedback. Now these commands display a clear error message:

"No configuration file found. Create a wrangler.jsonc file to define your D1 database."
