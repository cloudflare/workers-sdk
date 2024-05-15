---
"wrangler": patch
---

fix: do not allow non-string values in bulk secret uploads

Prior to Wrangler 3.4.0 we displayed an error if the user tried to upload a
JSON file that contained non-string secrets, since these are not supported
by the Cloudflare backend.

This change reintroduces that check to give the user a helpful error message
rather than a cryptic `workers.api.error.invalid_script_config` error code.
