---
"wrangler": patch
---

fix: bundled undici now respects `NODE_EXTRA_CA_CERTS`

Wrangler imports `fetch` from undici directly, which bypasses Node's built-in
`NODE_EXTRA_CA_CERTS` handling. This caused `SELF_SIGNED_CERT_IN_CHAIN` errors
for users behind TLS-intercepting proxies (Cloudflare WARP, corporate proxies).

The fix reads `NODE_EXTRA_CA_CERTS` and configures undici's global dispatcher
with the extra CA certificates — both in the CLI entry point and the API entry
point (used by `@cloudflare/vitest-pool-workers`).
