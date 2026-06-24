---
"@cloudflare/containers-shared": minor
"wrangler": minor
---

Add Google Artifact Registry support to `containers registries configure`

`wrangler containers registries configure` now recognizes `*-docker.pkg.dev` (Google Artifact Registry) domains.

- The Google service account email is the public credential, supplied with `--gar-email`. It must match the `client_email` in the service account key.
- The service account JSON key is the private credential. It is provided via stdin (a file path, raw JSON, or base64) or an interactive prompt (a file path or base64) — never as a CLI flag, so it does not appear in shell history. The key is validated against `--gar-email` and stored base64-encoded.
- Secret reuse inherits the existence-first flow: when the target Secrets Store secret already exists, it is reused by reference and the key is not required. In that case the email cannot be verified locally; it is validated against the key when images are pulled.

```sh
<path-to-key>.json | npx wrangler@latest containers registries configure <region>-docker.pkg.dev --gar-email=<service-account-email> --secret-name=Google_Service_Account_JSON_Key
```
