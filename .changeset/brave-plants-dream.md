---
"@cloudflare/containers-shared": minor
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Add support for trusted_user_ca_keys in Wrangler

You can now configure SSH trusted user CA keys for containers. Add the following to your wrangler.toml:

```toml
[[containers.trusted_user_ca_keys]]
public_key = "ssh-ed25519 AAAAC3..."
```

This allows you to specify CA public keys that can be used to verify SSH user certificates.
