---
"@cloudflare/workers-auth": patch
"wrangler": patch
---

Fix the Windows keyring install when the config path contains a space

On Windows, `wrangler login --use-keyring` could not set up keyring storage when the configuration path contained a space, such as a `C:\Users\John Smith` profile, so credentials fell back to the plaintext file. Keyring setup now works for those paths and credentials are stored encrypted.
