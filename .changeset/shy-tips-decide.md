---
"wrangler": patch
---

polish: don't log an error message if wrangler dev startup is interrupted.

When we quit wrangler dev, any inflight requests are cancelled. Any error handlers for those requests are ignored if the request was cancelled purposely. The check for this was missing for the prewarm request for a dev session, and this patch adds it so it dorsn't get logged to the terminal.
