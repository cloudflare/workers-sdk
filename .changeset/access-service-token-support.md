---
"wrangler": minor
---

Add support for Cloudflare Access Service Token authentication via environment variables

When running `wrangler dev` with remote bindings behind a Cloudflare Access-protected domain, Wrangler previously required `cloudflared access login` which opens a browser for interactive authentication. This does not work in CI/CD environments.

You can now set the `CLOUDFLARE_ACCESS_CLIENT_ID` and `CLOUDFLARE_ACCESS_CLIENT_SECRET` environment variables to authenticate using an Access Service Token instead:

```sh
export CLOUDFLARE_ACCESS_CLIENT_ID="<your-client-id>.access"
export CLOUDFLARE_ACCESS_CLIENT_SECRET="<your-client-secret>"
wrangler dev
```

Additionally, when running in a non-interactive environment (CI) without these credentials, Wrangler now throws a clear, actionable error instead of hanging on `cloudflared access login`.
