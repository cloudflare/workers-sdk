---
"wrangler": patch
"@cloudflare/chrome-devtools-patches": patch
---

Add analytics tracking for critical DevTools actions

When users open DevTools via `wrangler dev` (pressing `d`), we now pass telemetry context to DevTools via URL parameters. This enables tracking of critical debugging actions when telemetry is enabled:

- Breakpoint set
- Console evaluated
- Console command executed
- Stack frame restarted
- Panel shown (sources, network, console)

Events are sent to the existing Sparrow analytics endpoint with the event name "wrangler devtools action" and a `type` property indicating the specific action. This respects the user's existing wrangler telemetry preferences - no events are sent if telemetry is disabled.
