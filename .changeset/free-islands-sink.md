---
"wrangler": patch
---

Don't require the private credential when reusing an existing Secrets Store secret in `containers registries configure`

`wrangler containers registries configure` now checks whether the target Secrets Store secret already exists before resolving the private credential. When the secret already exists it is reused by reference, so the private credential no longer needs to be supplied (via stdin in non-interactive mode, or via a prompt interactively). This applies to all external registries.

The new-secret path is unchanged: the credential is still required and stored. The only visible interactive change is that the secret prompt now appears last and only when a new secret is being created.
