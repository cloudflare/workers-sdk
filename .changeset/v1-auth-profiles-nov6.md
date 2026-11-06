---
"@cloudflare/vite-plugin": minor
---

Support auth profile selection for experimental cf-authenticated remote bindings

Remote binding sessions can select an authentication profile with `CLOUDFLARE_AUTH_PROFILE`. Experimental cf authentication keeps account choices within the session instead of persisting them across invocations. Wrangler authentication retains its existing account persistence.
