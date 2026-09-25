---
"@cloudflare/autoconfig": patch
"@cloudflare/codemods": patch
"@cloudflare/deploy-helpers": patch
"@cloudflare/workers-auth": patch
"@cloudflare/workers-utils": patch
---

Keep Node.js ESM packages working when consumers rebundle them as CommonJS

Node.js-targeted ESM bundles now provide a real `require` implementation for bundled CommonJS dependencies. This avoids downstream patches for dynamic require calls and keeps the packages usable when a consumer rebundles them to CommonJS.
