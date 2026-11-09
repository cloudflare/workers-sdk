---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Reject empty values for required secrets supplied via `--secrets-file`

When a secret listed in `secrets.required` has an empty value in the file passed to `--secrets-file`, `wrangler deploy` and `wrangler versions upload` now fail with an error naming the empty secrets before uploading any assets, instead of uploading an empty string as the secret's value. This most commonly happens when a dotenv `${VAR}` reference points at an unset environment variable, which expands to an empty string.

Required secrets omitted from the secrets file still inherit their existing value, and empty values for secrets that are not required are still uploaded.
