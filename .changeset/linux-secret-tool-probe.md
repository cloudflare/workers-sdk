---
"@cloudflare/workers-auth": patch
"wrangler": patch
---

Detect an installed `secret-tool` on Linux even though it has no `--version` flag

`wrangler login --use-keyring` on Linux reported that `secret-tool` was not installed even when it was on `PATH`. The availability probe ran `secret-tool --version` and required an exit status of 0, but libsecret's `secret-tool` does not implement `--version`: it prints its usage and exits 2, so every real install was treated as missing.

The probe now treats `secret-tool` as available whenever the process could be spawned at all, regardless of its exit status, and only reports it missing when spawning fails (for example with `ENOENT` because it is not on `PATH`).
