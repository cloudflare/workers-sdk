---
"wrangler": patch
---

Tolerate missing resource permissions during resource provisioning

When Wrangler cannot check whether a bound resource exists because the API returns a 403, it now skips automatic provisioning for that resource type and continues the deploy. The deploy may still fail later if the resource is missing.
