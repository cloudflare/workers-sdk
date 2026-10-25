---
"@cloudflare/workers-auth": patch
"wrangler": patch
---

Fix the Windows keyring install when the config path contains a space

On Windows, `wrangler login --use-keyring` installs `@napi-rs/keyring` with npm through `cmd.exe`, which split an unquoted `--prefix` path such as `C:\Users\John Smith\...` at the space. The install failed and credentials fell back to the plaintext file. npm now runs in the install directory instead of receiving it as an argument.
