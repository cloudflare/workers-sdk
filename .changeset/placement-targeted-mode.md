---
"wrangler": minor
"@cloudflare/workers-utils": minor
---

Add support for "targeted" placement mode with region, host, and hostname fields

This change adds a new mode to `placement` configuration. You can specify one of the following fields to target specific external resources for Worker placement:

- `region`: Specify a region identifier (e.g., "aws:us-east-1") to target a region from another cloud service provider
- `host`: Specify a host with (required) port (e.g., "example.com:8123") to target a TCP service
- `hostname`: Specify a hostname (e.g., "example.com") to target an HTTP resource

These fields are mutually exclusive - only one can be specified at a time.

Example configuration:

```toml
[placement]
host = "example.com:8123"
```
