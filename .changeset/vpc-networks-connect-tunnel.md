---
"miniflare": minor
"wrangler": minor
---

Support `connect()` on remote VPC Network and VPC Service bindings in local development

Remote VPC Network and VPC Service bindings previously only supported HTTP and JSRPC, so calling `binding.connect(address)` against a private TCP service (for example a database) failed in local dev with `Incoming CONNECT on a worker not supported`. Raw TCP connections through remote VPC Network and VPC Service bindings now work in local development.

This feature is experimental. Existing HTTP and JSRPC usage of remote VPC Network and VPC Service bindings is unaffected, and no new configuration is required.
