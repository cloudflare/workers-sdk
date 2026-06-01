---
"miniflare": minor
---

Add JSON output to `/cdn-cgi/handler/scheduled`

The `/cdn-cgi/handler/scheduled` endpoint now accepts `?format=json` to return the scheduled handler result as JSON, including whether the handler called `controller.noRetry()`. Requests without `format=json` still return the existing text outcome for backward compatibility.
