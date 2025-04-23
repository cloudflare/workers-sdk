---
"wrangler": patch
---

fix: When generating Env types, set type of version metadata binding to `WorkerVersionMetadata`. This means it now correctly includes the `timestamp` field.
