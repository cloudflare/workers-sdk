---
"@cloudflare/workers-auth": minor
---

Correct and request the PlanetScale setup scope in new cf OAuth logins

Use the policy-compliant `hyperdrive-planetscale.setup` identifier for the PlanetScale setup scope and request it in new cf OAuth logins by default. OAuth grants remain constrained by the user's permissions, so only users with the corresponding Bach membership permission can exercise it. Existing sessions must authenticate again to receive the scope.
