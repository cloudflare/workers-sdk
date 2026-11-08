---
"wrangler": minor
"miniflare": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/vitest-plugin": minor
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/remote-bindings": minor
---

Preserve explicit owner accounts for experimental cross-account D1, KV, and R2 binding configuration

Carry `target_account_id` (native config `accountId`) through deployment, readback, and remote session metadata. Existing cross-account resources require explicit identifiers and are never automatically provisioned under the source account. Local Wrangler development requires remote bindings. Backend eligibility and product rollout restrictions still apply; cross-account R2 remains blocked pending bucket-generation enforcement.
