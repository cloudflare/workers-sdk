---
"wrangler": minor
---

Added additional fields to the output of `wrangler deployments` command. The additional fields are from the new value in the response `annotations` which includes `workers/triggered_by` and `rollback_from`

Example:

```
Deployment ID: Galaxy-Class
Created on:    2021-01-04T00:00:00.000000Z
Author:        Jean-Luc-Picard@federation.org
Trigger:       Upload from Wrangler 🤠
Rollback from: MOCK-DEPLOYMENT-ID-2222
```
