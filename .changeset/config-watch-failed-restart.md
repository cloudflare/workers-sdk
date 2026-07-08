---
"@cloudflare/vite-plugin": patch
---

fix: keep watching config changes after a failed dev server restart

Previously, when a config change made the dev server restart fail — for example because the updated Worker config was invalid — the plugin stopped watching config changes entirely: the change handler (covering the Worker config files, local dev vars, and the assets configuration) removed itself before restarting, and only a successfully created server would register a fresh one. Since Vite keeps the current server running when a restart fails, every subsequent config change (including the one that fixes the config) was silently ignored for the rest of the session.

The handler now stays registered and guards against re-entrant restarts instead, so fixing the config restarts the dev server as expected.
