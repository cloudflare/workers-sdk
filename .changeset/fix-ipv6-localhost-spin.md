---
"miniflare": patch
---

fix(miniflare): use 127.0.0.1 for internal loopback when localhost is configured

When `localhost` is configured as the host, Node.js may bind to `[::1]` (IPv6) while workerd resolves `localhost` to `127.0.0.1` (IPv4) first. This mismatch causes connection refused errors and 100% CPU spins.

This fix ensures the internal loopback communication between Node.js and workerd always uses `127.0.0.1` when `localhost` is configured, while preserving the user-facing URL as `localhost`.
