---
"wrangler": minor
---

Deprecate SSH passthrough flags in `wrangler containers ssh`

The `--cipher`, `--log-file`, `--escape-char`, `--config-file`, `--pkcs11`, `--identity-file`, `--mac-spec`, `--option`, and `--tag` flags are now deprecated. These flags expose OpenSSH-specific options that are tied to the current implementation. A future release will replace the underlying SSH transport, at which point these flags will be removed. They still function for now.
