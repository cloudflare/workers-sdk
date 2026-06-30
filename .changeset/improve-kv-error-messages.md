---
"wrangler": patch
---

Improve KV error messages to be clearer and more actionable

Error messages for KV namespace and key operations now consistently explain what went wrong, which flags or config fields to use, and what commands to run as alternatives. This covers namespace selection errors (delete, rename), binding resolution errors, config file issues, and preview namespace ambiguity.
