---
"miniflare": patch
---

Update Undici and its matching types to 7.29.1

Undici 7.29.1 fixes GHSA-3wwx-pv8p-q78v. This updates the shared dependency catalog used by Miniflare so new Wrangler and Vite plugin installations can resolve the patched runtime without an application-level override.
