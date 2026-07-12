---
"wrangler": minor
---

Fail fast with a clearer error when `account_id` is not accessible by the current login

When `account_id` (from your `wrangler.json` file, the `CLOUDFLARE_ACCOUNT_ID` environment variable, or a previous account selection) is not one of the accounts your current login can access, Wrangler now stops before making the request and explains the problem, instead of surfacing a generic `Authentication error [code: 10000]` from the API.

The message names the account, the active auth profile, and the accounts your login can reach, and points at auth profiles as the way to work across multiple accounts:

```
wrangler auth create <name>
wrangler auth activate <name>
```

The check is best-effort: if reachability cannot be determined (offline, a token without permission to read accounts, or a temporary preview account) Wrangler proceeds as before. On commands that resolve an account from a static source it adds a single lightweight account lookup; the fuller account list is only fetched when that lookup fails, to build the error message.
