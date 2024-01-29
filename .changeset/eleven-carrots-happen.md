---
"wrangler": patch
---

fix: allow empty strings in secret:bulk upload

Previously, the `secret:bulk` command would fail if any of the secrets in the secret.json file were empty strings and they already existed remotely.
