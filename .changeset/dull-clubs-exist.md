---
"wrangler": minor
---

Include all common telemetry properties in ad-hoc telemetry events

Previously, only command-based telemetry events (e.g., "wrangler command started/completed") included the full set of common properties. Ad-hoc events sent via `sendAdhocEvent` were missing important context like OS information, CI detection, and session tracking.

Now, all telemetry events include the complete set of common properties:

- `amplitude_session_id` and `amplitude_event_id` for session tracking
- `wranglerVersion` (and major/minor/patch variants)
- `osPlatform`, `osVersion`, `nodeVersion`
- `packageManager`
- `configFileType`
- `isCI`, `isPagesCI`, `isWorkersCI`
- `isInteractive`
- `isFirstUsage`
- `hasAssets`
- `agent`
