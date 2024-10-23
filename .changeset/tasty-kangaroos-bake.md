---
"wrangler": patch
---

Fix params serialization when send the trigger workflow API

Previously, wrangler did not parse the params sending it as a string to workflow's services.
