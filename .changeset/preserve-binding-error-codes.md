---
"miniflare": patch
"wrangler": patch
---

Preserve binding error codes and names in local development

Errors from remote bindings and from Node.js binding proxies (`getPlatformProxy()` and `Miniflare#getBindings()`) now keep their machine-readable properties, such as Artifacts' `code` and `numericCode`. Previously these properties were dropped and the error name was folded into the message (for example `"ArtifactsError: Repository not found"`), so code could only branch on error text during local development.

Node.js callers also keep custom error names such as `ArtifactsError`. Errors from remote bindings received inside a Worker keep their properties but are still named `Error`.
