---
"wrangler": patch
---

Explain when a Worker uploads but its routes cannot be updated due to token permissions

A route update denied for a Worker or zone now identifies the permissions needed on both configured and existing routes. Wrangler no longer leaves users to infer why an uploaded Worker did not receive its routes from a generic API error.
