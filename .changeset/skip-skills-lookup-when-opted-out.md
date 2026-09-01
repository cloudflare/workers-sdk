---
"wrangler": patch
---

Skip the skills install status lookup when telemetry is disabled

Telemetry events include a `currentAgentSkillsInstalled` property, and computing it can query the GitHub API. The lookup used to start before the telemetry permission was checked, so users who opted out via `WRANGLER_SEND_METRICS`, `DO_NOT_TRACK`, or `send_metrics` in their Wrangler config still triggered network requests on behalf of telemetry. The dispatcher now checks the permission first and only performs the lookup when telemetry is enabled.
