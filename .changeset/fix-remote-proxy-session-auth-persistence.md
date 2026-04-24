---
"wrangler": patch
---

fix: Preserve auth in remote proxy session data to avoid unnecessary session restarts

`maybeStartOrUpdateRemoteProxySession` was not including `auth` in its return value, so on subsequent calls `preExistingRemoteProxySessionData.auth` was always `undefined`. This caused the auth comparison to always detect a change, disposing and recreating the remote proxy session on every reload even when auth had not changed.
