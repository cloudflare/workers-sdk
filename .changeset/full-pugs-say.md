---
"@cloudflare/containers-shared": patch
"wrangler": patch
---

feat(containers): try to automatically get the socket path that the container engine is listening on.

Currently, if your container engine isn't set up to listen on `unix:///var/run/docker.sock` (or isn't symlinked to that), then you have to manually set this via the `dev.containerEngine` field in your Wrangler config, or via the env vars `WRANGLER_DOCKER_HOST`. This change means that we will try and get the socket of the current context automatically. This should reduce the occurrence of opaque `internal error`s thrown by the runtime when the daemon is not listening on `unix:///var/run/docker.sock`.

In addition to `WRANGLER_DOCKER_HOST`, `DOCKER_HOST` can now also be used to set the container engine socket address.
