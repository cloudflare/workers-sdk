---
"wrangler": patch
"@cloudflare/workers-utils": minor
---

Move shared helpers into `@cloudflare/workers-utils`

`getAccessToken`, `domainUsesAccess`, `createWorkerUploadForm`, `handleUnsafeCapnp`, `extractBindingsOfType`, and `isUnsafeBindingType` now live in `@cloudflare/workers-utils`. Wrangler re-exports them at the original paths for backward compatibility.
