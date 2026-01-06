---
"wrangler": patch
---

`wrangler deploy` delegates to `opennextjs-cloudflare deploy` only when the `--x-autoconfig` flag is used

The `wrangler deploy` command has been updated to delegate to the `opennextjs-cloudflare deploy` command when run in an open-next project. Once this behavior had been introduced it caused a few issues. So it's been decided to enable it for the time being only when the `--x-autoconfig` flag is set (since this behavior, although generally valid, is only strictly necessary for the `wrangler deploy`'s autoconfig flow).
