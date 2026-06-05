---
"wrangler": patch
---

Show actionable error message when authentication fails during remote dev

When `wrangler dev` with remote bindings encountered an authentication error (expired token, revoked OAuth, or invalid API token), the user saw a generic "A request to the Cloudflare API failed" message with no indication that authentication was the problem.

Now, authentication failures during remote dev display a clear error message with actionable steps.
