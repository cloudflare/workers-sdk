---
"@cloudflare/cli-shared-helpers": patch
"wrangler": patch
---

Keep Preview container logging isolated across concurrent deployments

Quiet Preview container deployment output now uses a log level scoped to each asynchronous call. Concurrent deployments keep their own output settings, and quiet calls preserve warnings and errors without changing the global CLI log level.
