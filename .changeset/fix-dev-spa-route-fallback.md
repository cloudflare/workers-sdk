---
"wrangler": patch
"miniflare": patch
---

Fix asset routing when custom domain routes are configured

Previously, local dev was routing custom-domain matches directly to the user Worker instead of the Workers + Assets router, meaning asset handling behaviour like `single-page-application` and `404-page` were not being applied on the root path.
