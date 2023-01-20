---
"wrangler": patch
---

fix: make it possible to query d1 databases from durable objects

This PR makes it possible to access D1 from Durable Objects.

To be able to query D1 from your Durable Object, you'll need to install the latest version of wrangler, and redeploy your Worker.

For a D1 binding like:

```toml
[[d1_databases]]
binding = "DB" # i.e. available in your Worker on env.DB
database_name = "my-database-name"
database_id = "UUID-GOES-HERE"
preview_database_id = "UUID-GOES-HERE"
```

You'll be able to access your D1 database via `env.DB` in your Durable Object.
