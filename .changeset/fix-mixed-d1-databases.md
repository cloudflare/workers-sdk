---
"miniflare": patch
---

fix: allow mixed `d1Databases` records containing both string and object entries

Previously, passing a `d1Databases` config that mixed plain string values and object entries (e.g. `{ MY_DB: "db-name", OTHER_DB: { id: "...", remoteProxyConnectionString: ... } }`) would cause Miniflare to throw an error. Both forms are now accepted and normalised correctly.
