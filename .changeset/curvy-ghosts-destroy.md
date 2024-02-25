---
"wrangler": patch
---

fix: include all currently existing bindings in `wrangler types`

Add support for Email Send, Vectorize, Hyperdrive, mTLS, Browser Rendering and Workers AI bindings in `wrangler types`

For example, from the following `wrangler.toml` setup:

```toml
[browser]
binding = "BROWSER"

[ai]
binding = "AI"

[[send_email]]
name = "SEND_EMAIL"

[[vectorize]]
binding = "VECTORIZE"
index_name = "VECTORIZE_NAME"

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "HYPERDRIVE_ID"

[[mtls_certificates]]
binding = "MTLS"
certificate_id = "MTLS_CERTIFICATE_ID"
```

Previously, nothing would have been included in the generated Environment.
Now, the following will be generated:

```ts
interface Env {
  SEND_EMAIL: SendEmail;
  VECTORIZE: VectorizeIndex;
  HYPERDRIVE: Hyperdrive;
  MTLS: Fetcher;
  BROWSER: Fetcher;
  AI: Fetcher;
}
```
