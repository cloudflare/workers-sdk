---
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Warn when invocation logs are enabled while logs are disabled

Configuration validation now warns when `observability.logs.invocation_logs` is `true` and `observability.logs.enabled` is `false`. Invocation logging remains disabled until `observability.logs.enabled` is set to `true`.
