---
"wrangler": minor
---

Add `wrangler vpc network` commands for managing VPC networks

New CLI commands for creating and managing VPC networks:

- `wrangler vpc network create <name>` — create a network with a required `--tunnel-id` and optional `--resolver-ips`
- `wrangler vpc network list` — list all networks for the account
- `wrangler vpc network get <network-id>` — retrieve a single network by ID
- `wrangler vpc network update <network-id>` — update name and/or resolver IPs
- `wrangler vpc network delete <network-id>` — delete a network

Also lifts the restriction that required `network_id` in `vpc_networks` bindings to equal `"cf1:network"` — any string value is now accepted, enabling bindings to explicitly created network entities.
