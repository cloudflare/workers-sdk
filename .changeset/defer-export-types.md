---
"@cloudflare/vite-plugin": patch
---

fix: defer worker export type discovery to avoid TDZ on circular deps

Skip eager `getCurrentWorkerNameToExportTypesMap()` during dev server startup. Use config-derived export types instead, which reads DO/WEP/Workflow bindings from `wrangler.jsonc` without loading user code. The existing HMR handler corrects any discrepancy when the module first loads on request.

This fixes dev startup for workers that import packages with circular internal imports (e.g. drizzle-orm) which cause TDZ errors under `noExternal: true`.
