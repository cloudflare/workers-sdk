---
"miniflare": patch
---

Authenticate dev registry updates and internal loopback requests

Require per-instance credentials for dev registry updates and internal loopback requests, including WebSocket upgrades. Authenticate callers before parsing registry updates or dispatching privileged loopback operations, while preserving legitimate shared-storage peers.
