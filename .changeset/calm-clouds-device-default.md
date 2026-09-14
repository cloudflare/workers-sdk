---
"@cloudflare/workers-auth": minor
---

Support per-CLI default OAuth login flows

CLI descriptors can now make OAuth device authorization their default while preserving a per-login opt-out. The cf auth layer enables this default for both explicit login commands and implicit logins started during account resolution; Wrangler continues to use its localhost callback flow by default.
