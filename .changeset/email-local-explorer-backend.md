---
"miniflare": minor
---

Add email routing and sending capture for the local explorer. Received emails are tracked with a handling path that records each action taken by the worker's `email()` handler (`received`, `forwarded`, `replied`, `rejected`, `unhandled`). Sent emails from the `send_email` binding are also captured. Both are stored in-memory for the current dev-server session and exposed via `/api/local/email/*` endpoints so they can be inspected in the local explorer UI.
