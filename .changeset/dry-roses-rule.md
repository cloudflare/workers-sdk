---
"wrangler": patch
---

fix: let wrangler dev try to startup on stackblitz in remote mode

Trying to get wrangler dev's remote mode working on stackblitz, but there's a hard exit whenever it detects that it's runnin in a webcontainer. This patch lets it run if it's running in remote mode.
