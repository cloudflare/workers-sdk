---
"wrangler": minor
---

fix: D1 execute and backup commands improvements

- Better and faster handling when importing big SQL files using execute --file
- Increased visibility during imports, sends output with each batch API call
- Backups are now downloaded to the directory where wrangler was initiated from
