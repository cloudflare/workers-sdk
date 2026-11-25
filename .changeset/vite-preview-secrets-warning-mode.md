---
"@cloudflare/vite-plugin": patch
---

Name the files preview reads in the missing secrets warning

Previously, the warning named files for Vite's mode, such as `.env.production`, even when preview read the files for the mode recorded in Build Output.
