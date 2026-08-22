---
"miniflare": patch
---

Re-register a Worker in the dev registry after stale cleanup removes its entry

A running Worker heartbeats its dev registry entry every 10 seconds, and any process reading the registry deletes entries older than 90 seconds. Both halves stop while the machine is suspended, so resuming from sleep leaves every entry stale and the first read deletes them — including entries whose owner is still running. The heartbeat then found its own entry missing and stood itself down, leaving the Worker invisible to service bindings in other `wrangler dev` / `vite dev` processes until an unrelated config update happened to re-register it; peers kept failing with `Worker "<name>" not found. Make sure it is running locally.` A Worker now writes its entry back when it finds it missing, while still standing down when another process has claimed the name.
