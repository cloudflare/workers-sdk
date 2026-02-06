---
"@cloudflare/containers-shared": minor
"wrangler": minor
---

Updated registries delete subcommand to handle new API response that now returns a secrets store secret reference after deletion. Wrangler will now prompt the user if they want to delete the associated secret. If so, added new logic to retrieve a secret by its name. The subcommand will then delete the secret.
