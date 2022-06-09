---
"wrangler": patch
---

feat: Upload the delta for `wrangler pages publish`

We now keep track of the files that make up each deployment and intelligently only upload the files that we haven't seen. This means that similar subsequent deployments should only need to upload a minority of files and this will hopefully make uploads even faster.
