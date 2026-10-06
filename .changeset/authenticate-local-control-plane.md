---
"miniflare": patch
---

Authenticate local runtime control-plane requests

Require per-instance credentials for dev registry updates and internal loopback requests, including WebSocket upgrades. Add `unsafeLocalExplorerSecret` so programmatic integrations can authenticate local Explorer operations while keeping production API credentials out of local requests.
