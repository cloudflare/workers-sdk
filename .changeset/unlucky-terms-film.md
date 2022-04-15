---
"wrangler": patch
---

Make `wrangler tail` TTY-aware, and stop printing non-JSON in JSON mode

Closes #493

2 quick fixes:

- Check `process.stdout.isTTY` at runtime to determine whether to default to "pretty" or "json" output for tailing.
- Only print messages like "Connected to {worker}" if in "pretty" mode (errors still throw strings)
