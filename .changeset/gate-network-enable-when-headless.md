---
"wrangler": patch
---

Stop the headless inspector Network flood that wedges long-running `wrangler dev`

`InspectorProxyWorker` enabled the runtime Network domain whether or not a DevTools client was attached, so headless `wrangler dev` (e.g. a long-lived session using the containers feature) received a `Network.dataReceived` message per response body chunk into `runtimeMessageBuffer`, which `tryDrainRuntimeMessageBuffer` never drains while no DevTools client is connected. Over a long session under load this grows unbounded and the dev server eventually stops accepting connections.

Two changes close it: gate the `Network.enable` sent on runtime connect on an attached DevTools client (mirroring the existing `Debugger.enable` gate), and send `Network.disable` when DevTools disconnects (mirroring the existing `Debugger.disable`) so the attach-then-detach case doesn't reintroduce the flood. Interactive debugging is unaffected: DevTools sends its own `Network.enable` on attach. Fixes #14191.
