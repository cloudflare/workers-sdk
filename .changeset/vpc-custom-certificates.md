---
"wrangler": minor
---

Add custom CA and client certificate references to Workers VPC service TLS settings

Workers VPC (open beta) service create and update commands accept `--certificate-authority` and `--client-certificate` UUIDs. Use either flag alone or both together. Whenever you supply either reference, explicitly choose `--cert-verification-mode`, even if the service already has a mode configured:

- `verify_full`: verify the origin certificate chain and hostname (the platform default).
- `verify_ca`: verify the chain but skip hostname verification, weakening origin identity checks.
- `disabled`: do not verify the origin certificate; this allows connections to impersonated origins and is unsafe for production.

For HTTP services, these settings apply to HTTPS connections, not plaintext HTTP. TCP services can use them for upstream TLS, including PostgreSQL.

TLS settings are per-service only: host and resolver networks have no TLS settings or inheritance. Omitting TLS settings on creation uses platform defaults (certificate chain and hostname verification). Explicit mode-only configuration, including `verify_full`, is accepted and retained. A custom CA cannot be combined with `disabled`; a client certificate without a custom CA can.

The initial backend rollout restricts custom certificate references to verified JWT actors whose email domain is exactly `cloudflare.com` (case-insensitive). External callers and account tokens receive a 403; this is not yet a general customer rollout. Verification-mode-only configuration remains available to all callers. Wrangler surfaces backend authorization failures without reporting success.

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

Updates still require the complete service configuration. Unrelated updates preserve configured service TLS. Rotate either reference or both, with an explicit mode; omitted references are preserved. A mode-only update also preserves existing references. For example, rotate the web service's client certificate while retaining its CA:

```sh
pnpm exec wrangler vpc service update <web-service-uuid> \
  --name private-web --type http --https-port 443 \
  --ipv4 10.0.0.10 --tunnel-id <tunnel-uuid> \
  --client-certificate <replacement-client-uuid> --cert-verification-mode verify_full
```

The update-only flags `--remove-certificate-authority` and `--remove-client-certificate` remove individual service references while preserving the mode and other reference. A reference cannot be set and removed in the same command. To remove the web service's CA while retaining its client certificate:

```sh
pnpm exec wrangler vpc service update <web-service-uuid> \
  --name private-web --type http --https-port 443 \
  --ipv4 10.0.0.10 --tunnel-id <tunnel-uuid> \
  --remove-certificate-authority
```

Use `--remove-client-certificate` in place of `--remove-certificate-authority` to remove only the client reference. Removing the final certificate preserves the configured mode, including an explicit mode-only `verify_full`. Removal releases unused backend certificate bindings but does not delete uploaded account certificates.

To change only the verification mode while preserving configured certificate references:

```sh
pnpm exec wrangler vpc service update <web-service-uuid> \
  --name private-web --type http --https-port 443 \
  --ipv4 10.0.0.10 --tunnel-id <tunnel-uuid> \
  --cert-verification-mode verify_ca
```

Inspect the service's verification mode and CA/client certificate UUIDs (or `None`), without exposing certificate or private-key contents:

```sh
pnpm exec wrangler vpc service get <service-uuid>
```
