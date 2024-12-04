---
"wrangler": patch
---

fix: make sure Wrangler doesn't create a `.wrangler` tmp dir in the `functions/` folder of a Pages project

This regression was introduced in https://github.com/cloudflare/workers-sdk/pull/7415
and this change fixes it by reverting that change.
