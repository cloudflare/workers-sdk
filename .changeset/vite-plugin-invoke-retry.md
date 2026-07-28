---
"@cloudflare/vite-plugin": patch
---

Retry transient module-transport failures in the runner worker

Each `fetchModule` invoke was a single fetch to the dev server with no retry. If that one fetch failed transiently (e.g. `Network connection lost` when workerd reuses a loopback connection that Node just closed), Vite's module runner cached the rejection and every request importing the affected module failed for the rest of the dev session. The invoke is an idempotent request for module code, so retry it up to three times before giving up.
