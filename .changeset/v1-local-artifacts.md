---
"@cloudflare/vite-plugin": minor
---

Support local Artifacts bindings in Vite plugin v1

Set `remote: false` on an Artifacts binding in Wrangler configuration to use local repositories. With `remoteBindings: false`, Artifacts also uses the local simulator. Omitted `remote` continues to use deployed repositories when remote bindings are enabled. Local Artifacts requires Git 2.32 or newer.
