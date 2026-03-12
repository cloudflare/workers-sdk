---
"wrangler": minor
---

Add TCP service type support for Workers VPC

You can now create TCP services in Workers VPC using the `--type tcp` option:

```bash
wrangler vpc service create my-db --type tcp --tcp-port 5432 --ipv4 10.0.0.1 --tunnel-id <tunnel-uuid>
```

This enables exposing TCP-based services like PostgreSQL, MySQL, and other database servers through Workers VPC.
