---
"wrangler": patch
---

Add re-authentication hint to account fetch error messages

When Wrangler fails to automatically retrieve account IDs, the error messages now suggest running `wrangler login` as a troubleshooting step. This addresses confusion for users who encounter these errors after OAuth system changes or other authentication issues.
