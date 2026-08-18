---
"wrangler": minor
---

Add experimental `wrangler hyperdrive planetscale signature` for provisioning Cloudflare-billed PlanetScale databases

`wrangler hyperdrive planetscale signature` prints a signed authorization as JSON, proving to PlanetScale that Cloudflare will be billed for the database you are about to create:

```sh
wrangler hyperdrive planetscale signature |
  pscale database create <name> --org <org> --cloudflare-billing @-
```

Wrangler authorizes the Cloudflare billing side only, so your PlanetScale credentials stay between you and `pscale`.

The signature is a cryptographically signed token that authorizes creating a database billed to your Cloudflare account. Treat it as a credential and do not share it. Piping it, as above, is recommended over passing it as a command line argument.

This command is experimental and its interface may change.
