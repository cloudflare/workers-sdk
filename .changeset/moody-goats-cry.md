---
"wrangler": minor
---

Adds the `--force-subdomain-deploy` flag to the `wrangler triggers deploy` command.

Wrangler will sometimes skip the API call if the config file matches
the remote state. The flag lets us skip this behavior, and force the
subdomain deployment.
