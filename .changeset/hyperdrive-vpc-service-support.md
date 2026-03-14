---
"wrangler": minor
---

Add Workers VPC service support for Hyperdrive origins

Hyperdrive configs can now connect to databases through Workers VPC services using the `--service-id` option:

```bash
wrangler hyperdrive create my-config --service-id <vpc-service-uuid> --database mydb --user myuser --password mypassword
```

This enables Hyperdrive to connect to databases hosted in private networks that are accessible through Workers VPC TCP services.
