---
"wrangler": minor
---

Add experimental `wrangler hyperdrive planetscale` commands for provisioning Cloudflare-billed PlanetScale databases

`wrangler hyperdrive planetscale create <name>` authorizes the Cloudflare billing side and then invokes PlanetScale's own CLI to create the database:

```sh
wrangler hyperdrive planetscale create my-db --org my-org
```

Anything after `--` is forwarded verbatim to `pscale database create`, so PlanetScale's own options are available without Wrangler having to mirror them:

```sh
wrangler hyperdrive planetscale create my-db --org my-org -- \
  --region us-east --cluster-size PS-10 --engine postgresql
```

See [PlanetScale's documentation](https://planetscale.com/docs/reference/database#create-a-database) for the supported options.

`pscale` must be installed and logged in. Wrangler authorizes the Cloudflare billing side only, so your PlanetScale credentials stay between you and `pscale`. Set `WRANGLER_PSCALE_BIN` to point Wrangler at a specific binary.

`wrangler hyperdrive planetscale signature` prints that authorization as JSON instead, for callers that would rather drive `pscale` themselves:

```sh
wrangler hyperdrive planetscale signature |
  pscale database create <name> --org <org> --cloudflare-billing @-
```

Piping keeps the signature out of the process list, where any local user could otherwise read it and use it to create a database billed to your account.

Both commands are experimental and their interfaces may change.
