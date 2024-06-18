---
"create-cloudflare": patch
---

chore: use latest dependencies for hello-world templates

When generating a plain hello world worker, we're picking up older versions of vitest/pool-workers. this updates the package.jsons to pick up newer versions instead. Ideally we should automate this, but we can do that later. I also updated the wrangler deps to the current version so it's clearer for developers what they're using (still not accurate, but better than showing 3.0.0). Again, this should be automated, but we can do that later.
