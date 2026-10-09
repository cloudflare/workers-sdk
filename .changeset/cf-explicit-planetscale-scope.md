---
"@cloudflare/workers-auth": minor
---

Allow cf consumers to explicitly request the `hyperdrive-planetscale:setup` OAuth scope

The scope remains excluded from default logins so permission to create Cloudflare-billed PlanetScale databases is requested only by commands that need it.
