---
"@cloudflare/deploy-helpers": patch
---

Fall back to the zone-based routes API on any 403 from the bulk-routes endpoint

`wrangler deploy` only fell back to the zone-based endpoint when the account-level routes API answered 403 with error code 10000. The API does not always attach that code to the "not all zones" 403, and when it does not, the deploy aborts even though the Worker was uploaded successfully and the routes were unchanged — a failed deploy that actually shipped. The fallback now triggers on the status as well as the code.
