---
"@cloudflare/vite-plugin": patch
---

Use the date that the plugin is built as the default compatibility date.

When no compatibility date was set by the user, the plugin was falling back to the current date. This meant that the date could get ahead of the latest date supported by the installed version of workerd. We now populate the default compatibility date when the plugin is built. This means that it is updated with each release but then stays fixed.
