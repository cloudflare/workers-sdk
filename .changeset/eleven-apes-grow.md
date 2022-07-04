---
"wrangler": patch
---

feat: `config.no_bundle` as a configuration option to prevent bundling

As a configuration parallel to `--no-bundle` (introduced in https://github.com/cloudflare/wrangler2/pull/1300 as `--no-build`, renamed in https://github.com/cloudflare/wrangler2/pull/1399 to `--no-bundle`), this introduces a configuration field `no_bundle` to prevent bundling of the worker before it's published. It's inheritable, which means it can be defined inside environments as well.
