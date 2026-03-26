---
"wrangler": minor
---

Add `--cert-verification-mode` option to `wrangler vpc service create` and `wrangler vpc service update`

You can now configure the TLS certificate verification mode when creating or updating a VPC connectivity service. This controls how the connection to the origin server verifies TLS certificates.

Available modes:

- `verify_full` (default) -- verify certificate chain and hostname
- `verify_ca` -- verify certificate chain only, skip hostname check
- `disabled` -- do not verify the server certificate at all

```sh
wrangler vpc service create my-service --type tcp --tcp-port 5432 --ipv4 10.0.0.1 --tunnel-id <tunnel-uuid> --cert-verification-mode verify_ca
```

This applies to both TCP and HTTP VPC service types. When omitted, the default `verify_full` behavior is used.
