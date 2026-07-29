---
"create-cloudflare": minor
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Support the `DO_NOT_TRACK` environment variable as a telemetry opt-out

Setting `DO_NOT_TRACK=1` (see https://donottrack.sh/) disables telemetry in both Wrangler and `create-cloudflare`. The tool-specific variables `WRANGLER_SEND_METRICS` and `CREATE_CLOUDFLARE_TELEMETRY_DISABLED` still take precedence.
