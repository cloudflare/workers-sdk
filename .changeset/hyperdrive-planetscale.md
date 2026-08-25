---
"wrangler": minor
---

Add experimental `wrangler hyperdrive planetscale signature` for provisioning Cloudflare-billed PlanetScale databases

`wrangler hyperdrive planetscale signature` prints a signed authorization as JSON, proving to PlanetScale that Cloudflare will be billed for the database you are about to create:

```sh
npx wrangler hyperdrive planetscale signature | \
  pscale database create <name> \
    --org <org> \
    --engine postgresql \
    --cloudflare-billing @- \
    --format json
```

`pscale database create` defaults to Vitess, so pass `--engine postgresql` for a Postgres database, and `--format json` is recommended when the output is consumed by an agent.

This requires `pscale` v0.313.0 or newer. Wrangler authorizes the Cloudflare billing side only, so your PlanetScale credentials stay between you and `pscale`.

The signature is a cryptographically signed token that authorizes creating a database billed to your Cloudflare account. Treat it as a credential and do not share it. Piping it, as above, is recommended over passing it as a command line argument.

This command is experimental and its interface may change.
