---
"@cloudflare/format-errors": patch
---

Fix error formatting to reliably return fallback responses on failure

Previously, if something went wrong while formatting a pretty error page, the failure could go unhandled, resulting in no response being returned to the user. Now, errors during formatting are properly caught, ensuring users always receive a 500 JSON fallback response.
