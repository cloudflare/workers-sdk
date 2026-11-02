---
"@cloudflare/deploy-helpers": minor
---

Require explicit route metadata flags when downloading Worker configuration

`fetchWorkerConfig` and `downloadWorkerConfig` now accept separate `fetchRoutes` and `fetchCustomDomains` booleans instead of inferring them from an optional local route list. This clarifies which route metadata callers require without changing Wrangler behavior.
