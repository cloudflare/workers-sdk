---
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": minor
---

Experimental: add a Logs view and a Traces/Logs switcher to the Local Explorer's Observability section

Adds a Logs view alongside Traces, listing captured `console.log` events (timestamp, level, message, operation) with a query bar (free text plus `level:` and `op:` filters) and per-row expansion to the full JSON event. A title dropdown switches between the Traces and Logs views. Both read through the observability `/query` endpoint.
