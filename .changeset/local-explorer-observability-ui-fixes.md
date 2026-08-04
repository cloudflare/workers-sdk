---
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Improve the Local Explorer's Observability views

`console.log` messages now render the way the console would (JSON-encoded strings are unwrapped and multi-argument logs are joined), traces and events can be looked up by trace or span id from the search bar, and an event's "View trace" button jumps to the exact invocation that emitted it — even when a trace_id spans several invocations (e.g. a subrequest or self fetch).
