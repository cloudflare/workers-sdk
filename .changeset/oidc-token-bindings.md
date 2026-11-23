---
"@cloudflare/codemods": minor
"@cloudflare/config": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Add the `oidc_tokens` binding

An OIDC token binding issues short-lived OpenID Connect tokens for the Worker's own identity, for one audience. Exchange them for cloud credentials, or send them to an API as a bearer token, instead of storing long-lived credentials as secrets:

```jsonc
"oidc_tokens": [{ "binding": "API_TOKEN", "audience": "https://api.example.com" }]
```

`env.API_TOKEN.getToken()` returns a newly signed JWT. Set `"alg": "RS256"` for verifiers that don't accept the default, ES256. Wrangler validates the audience (1 to 2048 printable ASCII characters, no whitespace), uploads the binding, generates its `OidcTokenBinding` type, and prints it in the bindings table. After a deploy, `wrangler deploy` prints the issuer and subject to put in the verifier's trust policy. The subject contains the Worker's immutable ID, which no other output shows. The binding isn't available in local development yet. Accounts must be enabled for the binding before they can deploy it.
