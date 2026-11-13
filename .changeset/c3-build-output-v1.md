---
"create-cloudflare": patch
---

Find the deployed Worker's name in Build Output v1

After `cf deploy`, C3 reads the Worker's name from the Build Output to look up its workers.dev URL. It now reads `.cloudflare/output/v1/`, falling back to `.cloudflare/output/v0/` because C3 installs `cf@latest`, which may still write v0.
