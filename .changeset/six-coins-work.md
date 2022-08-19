---
"wrangler": patch
---

fix: pass create-cloudflare the correct path

wrangler generate was passing create-cloudflare an absolute path, rather than a folder name, resulting in "doubled-up" paths
