---
"wrangler": patch
---

fix: Upload filepath-routing configuration in wrangler pages publish

Publishing Pages projects containing a functions directory incorrectly did not upload the filepath-routing config so that the user can view it in Dash. This fixes that, making the generated routes viewable under `Routing configuration` in the `Functions` tab of a deployment.
