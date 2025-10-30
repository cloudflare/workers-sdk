---
"wrangler": patch
---

Ensure that process.env is case-insensitive on Windows

The object that holds the environment variables in `process.env` does not care about the case of its keys
in Windows. For example, `process.env.SystemRoot` and `process.env.SYSTEMROOT` will refer to the same value.

Previously, when merging fields from `.env` files we were replacing this native object with a vanilla
JavaScript object, that is case-insensitive, and so sometimes environment variables appeared to be missing
when in reality they just had different casing.
