---
"wrangler": minor
"miniflare": minor
---

Add `dev.privileged_containers` config and `--privileged-containers` CLI flag for FUSE in local dev

When set, miniflare launches local containers with the elevated permissions FUSE requires (`CAP_SYS_ADMIN`, `/dev/fuse`, AppArmor unconfined). Off by default.
