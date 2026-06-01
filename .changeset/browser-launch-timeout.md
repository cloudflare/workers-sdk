---
"miniflare": patch
---

Add timeout to browser-rendering browser launch to prevent infinite hangs

The browser-rendering plugin's `launchBrowser()` function now passes a 5-minute timeout to `waitForLineOutput()` when waiting for Chrome to print its DevTools WebSocket URL. Previously, if Chrome failed to start or crashed before printing the URL, the promise would hang forever. This could cause CI pipelines and local dev sessions to get stuck indefinitely.
