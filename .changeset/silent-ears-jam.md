---
"wrangler": patch
---

feat: cache account id selection

This adds caching for account id fetch/selection for all wrangler commands.

Currently, if we have an api/oauth token, but haven't provided an account id, we fetch account information from cloudflare. If a user has just one account id, we automatically choose that. If there are more than one, then we show a dropdown and ask the user to pick one. This is convenient, and lets the user not have to specify their account id when starting a project.

However, if does make startup slow, since it has to do that fetch every time. It's also annoying for folks with multiple account ids because they have to pick their account id every time.

So we now cache the account details into `node_modules/.cache/wrangler` (much like pages already does with account id and project name).

This patch also refactors `config-cache.ts`; it only caches if there's a `node_modules` folder, and it looks for the closest node_modules folder (and not directly in cwd). I also added tests for when a `node_modules` folder isn't available. It also trims the message that we log to terminal.

Closes https://github.com/cloudflare/wrangler2/issues/300
