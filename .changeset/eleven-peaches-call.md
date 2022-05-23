---
"wrangler": patch
---

Add a better message when a user doesn't have a Chromium-based browser.

Certain functionality we use in wrangler depends on a Chromium-based browser. Previously, we would throw a somewhat arcane error that was hard (or impossible) to understand without knowing what we needed. While ideally all of our functionality would work across all major browsers, as a stopgap measure we can at least inform the user what the actual issue is.

Additionally, add support for Brave as a Chromium-based browser.
