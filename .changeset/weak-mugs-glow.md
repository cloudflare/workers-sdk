---
"wrangler": patch
---

feat: offer to create a git repo when calling `wrangler init`

Worker projects created by `wrangler init` should also be managed by source control (popularly, git). This patch adds a choice in `wrangler init` to make the created project into a git repository.

Additionally, this fixes a bug in our tests where mocked `confirm()` and `prompt()` calls were leaking between tests.

Closes https://github.com/cloudflare/wrangler2/issues/847
