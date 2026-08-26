---
"@cloudflare/build-output-utils": minor
---

Support multiple named Workers in the experimental Build Output utilities

Build Output paths and config writing can now target any named Worker directory, and reading Build Output returns every Worker keyed by its directory name. `writeWorkerConfig` now accepts a single options object.
