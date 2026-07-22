---
"wrangler": patch
---

Fix a crash when diffing container configuration that contains `null` inside an array

Normalizing configuration for the deployment diff threw `TypeError: Cannot convert undefined or null to object` whenever an array field contained `null`, so `wrangler containers deploy` and `wrangler cloudchamber apply` failed instead of showing the diff. `null` entries in arrays are now preserved as-is.
