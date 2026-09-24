---
"@cloudflare/build-output-utils": minor
---

Allow frameworks to remove Worker bundles after prerendering

Build Output readers now ignore stale manifests when only static assets remain and omit non-default Workers that have neither a bundle nor assets. A default Worker must still contain deployable output.
