---
"@cloudflare/vite-plugin": patch
---

Ask for a rebuild when preview finds missing or outdated Build Output

When preview finds no Build Output, Build Output in the older v0 format, or Build Output in more than one format, it now says to build the project and preview again, rather than suggesting an upgrade.
