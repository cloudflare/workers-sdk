---
"@cloudflare/containers-shared": patch
---

fix: pull egress interceptor image by digest then explicitly tag

When pulling the egress interceptor image (`cloudflare/proxy-everything`), Docker's reference parser strips the tag from `name:tag@digest` references and resolves by digest only. This means the tag is never applied to the local image store. On some Docker configurations (notably Docker 29.x with the containerd image store), this can cause workerd to fail to find the image at container creation time.

The fix pulls by digest only, then explicitly applies the tag via `docker tag`, ensuring both `name:tag` and `name@digest` references are available locally.
