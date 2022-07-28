---
"wrangler": patch
---

fix: Retry check-missing call to make wrangler pages publish more reliable

Before uploading files in wrangler pages publish, we make a network call to check what files need to be uploaded. This call could sometimes fail, causing the publish to fail. This change will retry that network call.
