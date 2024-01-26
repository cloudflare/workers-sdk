---
"wrangler": patch
---

fix: replace D1's dashed time-travel endpoints with underscored ones

D1 will maintain its `d1/database/${databaseId}/time-travel/*` endpoints until GA, at which point older versions of wrangler will start throwing errors to users, asking them to upgrade their wrangler version to continue using Time Travel via CLI.
