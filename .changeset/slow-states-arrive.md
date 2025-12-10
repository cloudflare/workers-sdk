---
"wrangler": patch
---

Remove image validation for containers on wrangler deploy.

Internal customers are able to use additional image registries and will run into failures with this validation. Image registry validation will now be handled by the API.
