---
"wrangler": patch
---

fix: allow `wrangler pages dev` sessions to be reloaded

Previously, `wrangler pages dev` attempted to send messages on a closed IPC
channel when sources changed, resulting in an `ERR_IPC_CHANNEL_CLOSED` error.
This change ensures the channel stays open until the user exits `wrangler pages dev`.
