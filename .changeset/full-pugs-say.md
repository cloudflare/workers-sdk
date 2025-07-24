---
"@cloudflare/containers-shared": patch
"wrangler": patch
---

feat: try to automatically get path of docker socket

Currently, if your container tool isn't set up to listen at `unix:///var/run/docker.sock` (or isn't symlinked to that), then you have to manually set this via the `dev.containerEngine` field in your Wrangler config, or via the env vars `WRANGLER_DOCKER_HOST`. This change means that we will try and get the socket of the current context automatically. This should reduce the occurrence of opaque `internal error`s thrown by the runtime when the daemon is not listening at `unix:///var/run/docker.sock`.

You can still override this with `WRANGLER_DOCKER_HOST`, and we also now read `DOCKER_HOST` too.
