---
"wrangler": patch
---

feat: add support for reading build time env variables from a `.env` file

This change will automatically load up a `.env` file, if found, and apply its
values to the current environment. An example would be to provide a specific
CLOUDFLARE_ACCOUNT_ID value.

Related to cloudflare#190
