---
"miniflare": minor
---

Add JSON output to `/cdn-cgi/handler/email`

The `/cdn-cgi/handler/email` endpoint now accepts `?format=json` to return the email handler result as JSON, including its outcome, rejection reason, forwarded messages, and replies. Requests without `format=json` still return the existing text outcome for backward compatibility.
