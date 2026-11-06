---
"wrangler": minor
"@cloudflare/deploy-helpers": minor
---

Warn when deploying Containers with the deprecated default scheduling policy

`wrangler deploy` and `wrangler versions upload` now display a nonblocking deprecation warning for Container applications using the `default` scheduling policy, including when the policy is omitted. The warning identifies affected applications and links to migration instructions for the `durable_object` policy. Existing applications require code changes and a replacement application; changing the policy setting alone does not migrate them.
