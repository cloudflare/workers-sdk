---
"edge-preview-authenticated-proxy": patch
---

fix: Allowed arbitrary headers on cross-origin requests to Raw HTTP preview.

Requests sent to the rawhttp preview endpoint with arbitrary headers were being blocked due to same-origin policy.
We now include any request headers as part of `Access-Control-Allow-Headers` in the preflight response.
