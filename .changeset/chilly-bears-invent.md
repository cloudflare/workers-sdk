---
"wrangler": patch
---

fix: spread tail messages when logging

Logged messages (via console, etc) would previously be logged as an array of values. This spreads it when logging to match what is expected.
