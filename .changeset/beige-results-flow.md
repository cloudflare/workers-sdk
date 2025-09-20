---
"@cloudflare/vite-plugin": patch
---

Support Hyperdrive local connection strings from `.env` files

You can now define your Hyperdrive local connection string in a `.env` file using the `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING_NAME>` variable.

```sh
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_PROD_DB="postgres://user:password@127.0.0.1:5432/testdb"
```
