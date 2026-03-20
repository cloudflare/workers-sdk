---
"miniflare": patch
---

fix: allow mixed `kvNamespaces` records containing both string and object entries

Previously, passing a `kvNamespaces` config that mixed plain string values and object entries (e.g. `{ MY_NS: "ns-name", OTHER_NS: { id: "...", remoteProxyConnectionString: ... } }`) would cause Miniflare to throw an error. Both forms are now accepted and normalised correctly.
