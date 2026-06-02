---
"wrangler": patch
---

fix: Include `currentAgentSkillsInstalled` in command telemetry events

The `currentAgentSkillsInstalled` property was only included in adhoc telemetry events (e.g. `autoconfig_process_started`) but was missing from command events (`wrangler command started`, `wrangler command completed`, `wrangler command errored`). It is now included in all telemetry events.
