---
"wrangler": minor
"miniflare": minor
---

Add `dev.enable_containers_privileged_mode` (and `--enable-containers-privileged-mode`) opt-in for FUSE in local dev

Containers using FUSE work in production but break in `wrangler dev` because workerd doesn't grant `CAP_SYS_ADMIN`, mount `/dev/fuse`, or relax AppArmor on the container it creates. This adds a top-level dev config flag — `dev.enable_containers_privileged_mode` in `wrangler.json`, `--enable-containers-privileged-mode` on the CLI — that, when set, has miniflare ask workerd to launch local containers with those three permissions. Off by default; only takes effect when the user opts in.

Pairs with the workerd change in https://github.com/cloudflare/workerd/pull/6596, which adds the matching `allowPrivileged` option to `ContainerOptions` and gates the FUSE injection on it.
