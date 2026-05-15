---
"wrangler": patch
---

Prompt to provision a workers.dev subdomain before deploying Workflows

Wrangler now checks for the account-level workers.dev subdomain when deploying Workflows, even if the Worker is not being published to workers.dev. If the subdomain has not been registered yet, Wrangler prompts to create one before calling the Workflows deploy API so users avoid an opaque server-side deployment failure.
