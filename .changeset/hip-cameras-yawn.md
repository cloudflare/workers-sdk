---
"wrangler": minor
---

feat: implement the `wrangler cert upload` command

This command allows users to upload a mTLS certificate/private key or certificate-authority certificate chain.

For uploading mTLS certificate, run:

- `wrangler cert upload mtls-certificate --cert cert.pem --key key.pem --name MY_CERT`

For uploading CA certificate chain, run:

- `wrangler cert upload certificate-authority --ca-cert server-ca.pem --name SERVER_CA`
