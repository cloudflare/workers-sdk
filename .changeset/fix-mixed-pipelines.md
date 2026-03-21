---
"miniflare": patch
---

fix: allow mixed `pipelines` records containing both string and object entries

Previously, passing a `pipelines` config that mixed plain string values and object entries (e.g. `{ MY_PIPELINE: "pipeline-name", OTHER_PIPELINE: { pipeline: "...", remoteProxyConnectionString: ... } }`) would cause Miniflare to throw an error. Both forms are now accepted and normalised correctly.
