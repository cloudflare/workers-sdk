---
'wrangler': minor
---

feat: support CLOUDFLARE_ENV for environment selection

This change updates Wrangler's CLI parser to recognize the `CLOUDFLARE_ENV` environment variable. If the `--env` flag is not specified in a command, Wrangler will now use the value of `CLOUDFLARE_ENV` to determine the target environment.
This improves user experience in CI/CD pipelines and local development where setting an environment variable is often more convenient than appending a flag to every command. The `--env` flag continues to take precedence if provided.

Fixes #10891
