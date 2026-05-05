---
"@cloudflare/vite-plugin": patch
---

Fix `.dev.vars` written for `vite preview` to round-trip values containing quotes

When the plugin emits `dist/<env>/.dev.vars` for `vite preview`, it previously wrote each value as a double-quoted dotenv string with `"` escaped to `\"`. `dotenv` (the parser wrangler uses) does not unescape `\"` inside double-quoted values, so values containing `"` arrived at the worker with literal backslashes still in them.

The plugin now quotes strings using the first quote character that does not appear in the value (with the priority order: single → backtick → double), all of which dotenv strips correctly. If a value contains every supported quote character it throws instead of silently corrupting the value.
