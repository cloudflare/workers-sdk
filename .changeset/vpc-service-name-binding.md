---
"wrangler": minor
"@cloudflare/workers-utils": minor
---

Allow VPC service bindings to use `service_name` (name) instead of `service_id`

VPC service bindings can now be configured with a human-readable service name instead of copying
the service UUID. When `service_name` is provided, Wrangler will automatically look up the `service_id`
via the Cloudflare API at deploy time.

```json
{
  "vpc_services": [
    { "binding": "API_FOO", "service_name": "foo-api-internal" }
  ]
}
```

This is equivalent to the existing form:

```json
{
  "vpc_services": [
    { "binding": "API_FOO", "service_id": "0199295b-b3ac-7760-8246-bca40877b3e9" }
  ]
}
```

The `service_name` and `service_id` fields are mutually exclusive — only one may be specified per binding.
