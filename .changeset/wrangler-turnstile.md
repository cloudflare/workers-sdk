---
"wrangler": minor
---

Add `wrangler turnstile widget` commands for managing Turnstile widgets

You can now create, list, inspect, update, and delete Turnstile widgets from the CLI:

```
wrangler turnstile widget create <name> --domain example.com --mode managed
wrangler turnstile widget list
wrangler turnstile widget get <sitekey>
wrangler turnstile widget update <sitekey> --name "Renamed"
wrangler turnstile widget delete <sitekey>
```

`create`, `list`, and `update` accept `--json` for clean machine-readable output. `--domain` accepts comma-separated values, e.g. `--domain a.com,b.com`.

`create` prints the sitekey, the secret (shown only at creation time), and the canonical `challenges.cloudflare.com/turnstile/v0/siteverify` endpoint for backend verification. The hint is backend-agnostic; it doesn't assume Workers. `update` strips the secret from its response since it's only incidentally returned. `delete` prompts for confirmation; pass `--skip-confirmation`/`-y` to bypass.

The OAuth flow now requests the `challenge-widgets.write` scope (the existing Bach-derived scope for Turnstile widget CRUD). Existing OAuth sessions need to run `wrangler login` again to pick it up. API token users need a token with the `Account.Turnstile:Edit` permission.
