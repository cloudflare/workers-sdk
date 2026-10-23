---
"wrangler": minor
---

Add custom CA and client certificate references to Workers VPC service TLS settings

Workers VPC (open beta) service create and update commands accept `--certificate-authority` and `--client-certificate` UUIDs. Use either flag alone or both together. Whenever you supply either reference, explicitly choose `--cert-verification-mode`:

- `verify_full`: verify the origin certificate chain and hostname (the platform default).
- `verify_ca`: verify the chain but skip hostname verification, weakening origin identity checks.
- `disabled`: do not verify the origin certificate; this allows connections to impersonated origins and is unsafe for production.

For HTTP services, these settings apply to HTTPS connections, not plaintext HTTP. TCP services can use them for upstream TLS, including PostgreSQL.

TLS settings are per-service only: host and resolver networks have no TLS settings or inheritance. Omitting TLS settings uses platform defaults (certificate chain and hostname verification). Explicit mode-only configuration, including `verify_full`, is accepted. A custom CA cannot be combined with `disabled`; a client certificate without a custom CA can.

Upload certificates using the existing commands, then use the returned IDs below. Replace `<ca-uuid>`, `<client-uuid>`, `<tunnel-uuid>`, and service IDs with your own values; certificate references must be valid UUIDs. Upload replacement certificates the same way before rotating their references.

```sh
pnpm exec wrangler cert upload certificate-authority --ca-cert ./ca.pem --name private-ca
pnpm exec wrangler cert upload mtls-certificate --cert ./client.pem --key ./client-key.pem --name private-client
```

Create an HTTPS service with both a custom trust chain and an mTLS client certificate, or a PostgreSQL TCP service with only a custom CA:

```sh
pnpm exec wrangler vpc service create private-web \
  --type http --https-port 443 --ipv4 10.0.0.10 --tunnel-id <tunnel-uuid> \
  --certificate-authority <ca-uuid> --client-certificate <client-uuid> \
  --cert-verification-mode verify_full

pnpm exec wrangler vpc service create private-db \
  --type tcp --tcp-port 5432 --app-protocol postgresql \
  --hostname db.internal.example --resolver-ips 10.0.0.53 --tunnel-id <tunnel-uuid> \
  --certificate-authority <ca-uuid> --cert-verification-mode verify_full
```

For client-certificate-only configuration, use `--client-certificate <client-uuid> --cert-verification-mode verify_full` instead of the certificate flags in either create command.

Updates replace the complete service configuration, including TLS settings, in a single request, the same as `cf workers-vpc services update`. Pass every TLS option the service should keep: certificate references and the verification mode that you omit are cleared, and an update without TLS options returns the service to the platform defaults. Removing a reference releases its backend certificate binding but does not delete the uploaded account certificate. For example, rotate the web service's client certificate while keeping its CA:

```sh
pnpm exec wrangler vpc service update <web-service-uuid> \
  --name private-web --type http --https-port 443 \
  --ipv4 10.0.0.10 --tunnel-id <tunnel-uuid> \
  --certificate-authority <ca-uuid> --client-certificate <replacement-client-uuid> \
  --cert-verification-mode verify_full
```

To remove the CA while keeping the client certificate, repeat the update with only `--client-certificate <client-uuid>` and a verification mode.

Inspect the service's verification mode and CA/client certificate UUIDs (or `None`), without exposing certificate or private-key contents:

```sh
pnpm exec wrangler vpc service get <service-uuid>
```
