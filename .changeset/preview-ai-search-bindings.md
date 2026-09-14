---
"wrangler": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/workers-utils": minor
---

Support AI Search bindings in Worker Previews

`wrangler preview` now accepts `ai_search` and `ai_search_namespaces` entries in the `previews` block and includes them in Preview deployment bindings. This lets Workers that use AI Search instance or namespace bindings attach existing resources to Preview deployments, including preview-specific instance or namespace names.

These bindings are non-inheritable: declare them explicitly under `previews`. They attach to existing AI Search resources; preview does not provision new isolated instances or namespaces.
