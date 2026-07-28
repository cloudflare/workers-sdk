---
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Respect and surface the `Retry-After` header on Cloudflare API responses

Previously, if a Wrangler command (e.g. `wrangler versions upload`, `wrangler deploy`) hit the Cloudflare API's rate limit, the resulting error gave no indication of how long to wait before trying again, and 429 responses weren't retried at all (only `5xx` errors were, with a fixed linear backoff).

Now:

- `429 Too Many Requests` responses are automatically retried, alongside the existing `5xx` retry behaviour.
- If a retried response includes a `Retry-After` header, Wrangler waits for that duration instead of the default backoff, and logs a message indicating how long it's waiting. To avoid blocking for an excessive amount of time, waits longer than 60 seconds fail fast instead — the surfaced `Retry-After` value lets the caller schedule its own retry.
- If a retryable error is ultimately surfaced to the user (e.g. because retries were exhausted), the error message includes a note with the `Retry-After` duration, and the `command-failed` entry written to the Wrangler output file (`WRANGLER_OUTPUT_FILE_PATH`/`WRANGLER_OUTPUT_FILE_DIRECTORY`) gains a `retry_after_ms` field. This lets scripts and CI/CD pipelines calling Wrangler repeatedly (for example, `wrangler versions upload` on every commit) read the wait duration directly instead of regex-parsing stderr.

`APIError.isRetryable()` is unchanged (still `5xx` only); `retryOnAPIFailure()` separately retries 429s. `retryAfterMs`, when present, is honoured for any retried error, not just 429s.

`retryAfterMs` is also now populated on `APIError`s raised from direct R2 object requests, the Browser Rendering API, and errors surfaced from commands using the official `cloudflare` SDK client.
