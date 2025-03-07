---
"wrangler": patch
---

fix: retry zone and route lookup API calls

In rare cases, looking up Zone or Route API calls may fail due to transient errors. This change improves the reliability of `wrangler deploy` when these errors occur.

Also fixes a rare issue where concurrent API requests may fail without correctly throwing an error which may cause a deployment to incorrectly appear successful.
