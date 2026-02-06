---
"wrangler": minor
---

Improve autoconfig telemetry with granular event tracking

Adds detailed telemetry events to track the autoconfig workflow, including process start/end, detection, and configuration phases. Each event includes a unique session ID (`appId`), CI detection, framework information, and success/error status to help diagnose issues and understand usage patterns.
