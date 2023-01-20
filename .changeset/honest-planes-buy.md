---
"wrangler": minor
---

Added additional fields to the output of `wrangler deployments` command. The additional fields are from the
new value in the response `annotations` which includes `workers/triggered_by` and `rollback_from`

example:

```
Deployment ID: Some-ID
Created on: 2021-01-01T00:00:00.000000Z
Author: JLP@trek.org
Source: 🤠 Wrangler
Annotations
  Triggered by: upload
  Rollback from: MOCK-DEPLOYMENT-ID-0000
```
