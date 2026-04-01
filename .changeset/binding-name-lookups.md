---
"wrangler": minor
"@cloudflare/workers-utils": minor
---

Allow KV, Hyperdrive, and mTLS certificate bindings to use names instead of IDs

Bindings for KV namespaces, Hyperdrive configs, and mTLS certificates can now be configured
with human-readable names instead of opaque system-generated IDs. Wrangler will automatically
resolve the name to the corresponding ID via the Cloudflare API at deploy time.

KV namespaces — use `kv_namespace` instead of `id`:
```json
{ "kv_namespaces": [{ "binding": "MY_KV", "kv_namespace": "my-kv-store" }] }
```

Hyperdrive — use `hyperdrive_name` instead of `id`:
```json
{ "hyperdrive": [{ "binding": "MY_DB", "hyperdrive_name": "my-database" }] }
```

mTLS certificates — use `certificate_name` instead of `certificate_id`:
```json
{ "mtls_certificates": [{ "binding": "MY_CERT", "certificate_name": "my-cert" }] }
```

In each case, the name and ID fields are mutually exclusive.
