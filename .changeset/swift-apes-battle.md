---
"wrangler": patch
---

refactor: support backwards compatibility with environment names and related CLI flags

1. When in Legacy environment mode we should not compute name field if specified in an environment.
2. Throw an Error when `--env` and `--name` are used together in Legacy Environment, except for Secrets & Tail which are using a special case `getLegacyScriptName` for parity with Wrangler1
3. Started the refactor for args being utilized at the Config level, currently checking for Legacy Environment only.

Fixes https://github.com/cloudflare/wrangler2/issues/672
