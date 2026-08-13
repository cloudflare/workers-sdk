---
"@cloudflare/workers-utils": patch
---

Report malformed container SSH keys and a non-object `containers.configuration` as config errors instead of crashing

Previously, a `containers` entry with a malformed `authorized_keys` or `trusted_user_ca_keys` entry (a missing or non-string `public_key`, or an entry that is not an object), or a `containers.configuration` set to `null`, made Wrangler exit with a stack trace and "If you think this is a bug, please open an issue" rather than pointing at the field.

These configurations now produce an ordinary configuration error naming the offending field and array index, such as `containers.authorized_keys[0].public_key must be a string`. A `public_key` that is not an ED25519 key is also now reported with correct grammar.
