---
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/vitest-plugin": minor
---

Connect authenticated local Workers OIDC to the native token getter

Share lazy per-Worker brokers, authenticated development sessions, bounded API responses, token profile validation, current authorization and on-demand renewal across Wrangler, `cf dev`, and the Cloudflare Vite plugin. Keep OAuth credentials in the host process and display the server-authorized development subject. Vitest live issuance requires `developmentOidc: true`; offline tests can supply a host broker mock.

Retain authorized development sessions after temporary network, signing-service, rate-limit, and timeout failures. Honor `Retry-After` for issuance requests, and clear sessions and pending requests after login, permission, renewal, or invalid-response failures.

This experimental integration requires a workerd release containing `Worker.oidcTokenService` and Cloudflare's development issuance service, including its human OAuth verifier and API gateway routes. The current runtime pin predates the callback; a matching local workerd build can be exercised using `MINIFLARE_WORKERD_PATH` until that release is available.
