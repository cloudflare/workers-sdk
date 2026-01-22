---
"wrangler": minor
---

feat(hyperdrive): add MySQL SSL mode and Custom CA support

Hyperdrive now supports MySQL-specific SSL modes (`REQUIRED`, `VERIFY_CA`, `VERIFY_IDENTITY`) alongside the existing PostgreSQL modes. The `--sslmode` flag now validates the provided value based on the database scheme (PostgreSQL or MySQL) and enforces appropriate CA certificate requirements for each.

**Usage:**

```sh
# MySQL with CA verification
wrangler hyperdrive create my-config --connection-string="mysql://user:pass@host:3306/db" --sslmode=VERIFY_CA --ca-certificate-id=<cert-id>

# PostgreSQL (unchanged)
wrangler hyperdrive create my-config --connection-string="postgres://user:pass@host:5432/db" --sslmode=verify-full --ca-certificate-id=<cert-id>
```
