---
"wrangler": patch
---

Fix SolidStart autoconfig for projects using version 2.0.0-alpha or later

SolidStart v2.0.0-alpha introduced a breaking change where configuration moved from `app.config.(js|ts)` to `vite.config.(js|ts)`. Wrangler's autoconfig now detects the installed SolidStart version and based on it updates the appropriate configuration file
