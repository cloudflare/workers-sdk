---
"wrangler": minor
---

Stop `wrangler deploy`, `wrangler versions upload` and `wrangler preview` in projects that build for the Cloudflare CLI (`cf`)

If your project builds through `cf`, deploying it with Wrangler reads a different configuration, so it could update the wrong Worker or fail without explaining why. These commands now stop before uploading anything, name the `.cloudflare/output` directory they found, and tell you to run `cf deploy` instead. If that directory is just left over from an earlier build, deleting it restores the Wrangler workflow.

Ordinary Wrangler projects are unaffected, and `--dry-run` still works on `deploy` and `versions upload`. This is a new guard for the experimental Build Output Specification rather than a fix, and it gives three stable commands a failure mode they did not have before, so it is a minor.
