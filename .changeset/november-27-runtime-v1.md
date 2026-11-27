---
"@cloudflare/vite-plugin": patch
---

Update the local runtime to the November 27 release

Update Miniflare to 5.20261127.0-beta and Wrangler to 4.169.0. Projects without an explicit compatibility date default to November 27, 2026. Local Artifacts keeps its Git port reserved during startup and stable across configuration reloads, avoiding intermittent address-in-use failures.
