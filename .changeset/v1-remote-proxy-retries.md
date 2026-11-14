---
"@cloudflare/vite-plugin": patch
---

Retry remote binding requests when a replacement preview is already ready

A retriable request could remain queued if the old preview connection failed after a remote binding session update completed. Drain the retained remote binding proxy's retry queue immediately so requests finish without waiting for another request or reload.
