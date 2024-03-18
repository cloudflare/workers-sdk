---
"wrangler": patch
---

fix: ensure tail exits when the WebSocket disconnects

Previously when the we tail WebSocket disconnected, e.g. because of an Internet failure,
the `wrangler tail` command would just hang and neither exit nor any longer receive tail messages.

Now the process exits with an exit code of 1, and outputs an error message.

The error message is formatted appropriately, if the tail format is set to `json`.

Fixes #3927
