---
"wrangler": minor
---

Add experimental `wrangler hyperdrive planetscale signature` command

Generates a signed authorization for creating a Cloudflare-billed PlanetScale database and prints it as JSON to stdout, so it can be piped into PlanetScale's own CLI, e.g.:

```sh
SIG=$(wrangler hyperdrive planetscale signature)
pscale database create <name> --org <org> \
  --cloudflare-account-id "$(jq -r .account_id <<<"$SIG")" \
  --cloudflare-timestamp  "$(jq -r .timestamp  <<<"$SIG")" \
  --cloudflare-signature  "$(jq -r .signature  <<<"$SIG")"
```

This command is experimental and its interface may change.
