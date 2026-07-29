---
"miniflare": minor
---

Add email routing and sending capture for the local explorer. Received emails are captured together with the result of dispatching them to the worker's `email()` handler: the `outcome`, an optional `rejectReason`, the `forwards` and `replies` produced, and an ordered `events` lifecycle (`received`, `forward`, `reply`, `reject`, `unhandled`). Sent emails from the `send_email` binding are also captured. Both are stored for the current dev-server session and exposed via `/api/local/email/*` endpoints so they can be inspected in the local explorer UI.
