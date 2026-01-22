---
"wrangler": patch
---

Fixed Wrangler's error handling for both invalid commands with and without the `--help` flag, ensuring consistent and clear error messages.

Additionally, it also ensures that if you provide an invalid argument to a valid command, Wrangler will now correctly display that specific commands help menu.
