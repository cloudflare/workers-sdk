---
"wrangler": patch
---

feat: enable Wrangler to target the staging API by setting WRANGLER_API_ENVIRONMENT=staging

If you are developing Wrangler, or an internal Cloudflare feature, and during testing,
need Wrangler to target the staging API rather than production, it is now possible by
setting the `WRANGLER_API_ENVIRONMENT` environment variable to `staging`.

This will update all the necessary OAuth and API URLs, update the OAuth client ID, and
also (if necessary) acquire an Access token for to get through the firewall to the
staging URLs.
