---
"wrangler": patch
---

Fix custom-domain-only deploys failing for API tokens without Zone Workers Routes read permission

When `workers_dev` was disabled and `routes` contained only entries with `custom_domain: true`, every deploy after the first one fetched `/zones/:zoneId/workers/routes` to check for route conflicts, even though custom domains are not zone Workers Routes. Tokens scoped to Workers Scripts edit plus custom domains - without `Zone > Workers Routes > Read` - failed with "No access to the specified resource" after the Worker version had already been uploaded. The conflict check now only covers non-custom-domain routes; custom domain conflicts continue to be reported by the custom domains changeset API.
