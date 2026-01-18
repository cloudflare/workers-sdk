---
"wrangler": patch
---

Cache chosen account in memory to avoid repeated prompts

When users have multiple accounts and no `node_modules` directory exists for file caching, Wrangler (run via `npx` and equivalent commands) would prompt for account selection multiple times during a single command. Now the selected account is also stored in process memory, preventing duplicate prompts and potential issues from inconsistent account choices.
