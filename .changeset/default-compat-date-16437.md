---
"@cloudflare/workers-utils": patch
"@cloudflare/autoconfig": patch
"@cloudflare/build-output-utils": patch
"@cloudflare/cli-shared-helpers": patch
"@cloudflare/codemods": patch
"@cloudflare/config": patch
"@cloudflare/containers-shared": patch
"@cloudflare/deploy-helpers": patch
"@cloudflare/pages-functions": patch
"@cloudflare/pages-shared": patch
"@cloudflare/runtime-types": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
"@cloudflare/workers-auth": patch
"create-cloudflare": patch
"miniflare": patch
"wrangler": patch
---

Update `DEFAULT_COMPAT_DATE` to 2026-10-23

Use the bundled workerd release's compatibility date by default when scaffolding new projects or when no compatibility date is configured.
