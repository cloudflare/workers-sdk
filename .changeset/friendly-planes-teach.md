---
"wrangler": minor
---

Add `WRANGLER_FORCE_INTERACTIVE` environment variable to enable interactive mode without a TTY

When running `wrangler dev` in environments without a real TTY (such as automated tests or CI pipelines that need to simulate user input), you can now set `WRANGLER_FORCE_INTERACTIVE=1` to enable interactive features like hotkey handling.

```bash
WRANGLER_FORCE_INTERACTIVE=1 wrangler dev
```

This is useful for testing interactive features programmatically by writing to the process's stdin.
