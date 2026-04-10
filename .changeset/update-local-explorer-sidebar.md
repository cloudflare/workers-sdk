---
"@cloudflare/local-explorer-ui": minor
---

Update local explorer sidebar with collapsible groups, theme persistence, and Kumo v1.17

Adds localStorage persistence for sidebar group expansion states and theme mode (light/dark/system). The sidebar now uses Kumo v1.17 primitives with collapsible groups and a theme toggle in the footer.

Users can now cycle between light, dark, and system theme modes, and their preference will be persisted across sessions.

Sidebar groups (D1, Durable Objects, KV, R2, Workflows) also remember their collapsed/expanded state.
