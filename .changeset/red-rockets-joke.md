---
"create-cloudflare": patch
---

fix: creating an application from a non-existent or private repository will no longer cause the CLI to get stuck in the cloning stage. Now, when cloning a non-existent repo the CLI will exit with the error message "Failed to clone remote template" and when cloning a private repo you will be prompted for the username/password.
