---
"wrangler": patch
---

feature: add support for publishing to Custom Domains

With the release of Custom Domains for workers, users can publish directly to a custom domain on a route, rather than creating a dummy DNS record first and manually pointing the worker over - this adds the same support to wrangler.

Users declare routes as normal, but to indicate that a route should be treated as a custom domain, a user simply uses the object format in the toml file, but with a new key: custom_domain (i.e. `routes = [{ pattern = "api.example.com", custom_domain = true }]`)

When wrangler sees a route like this, it peels them off from the rest of the routes and publishes them separately, using the /domains api. This api is very defensive, erroring eagerly if there are conflicts in existing Custom Domains or managed DNS records. In the case of conflicts, wrangler prompts for confirmation, and then retries with parameters to indicate overriding is allowed.
