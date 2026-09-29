---
"miniflare": patch
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Resolve the affected Undici dependency in new Wrangler and Vite plugin installs

Undici 7.29.1 fixes GHSA-3wwx-pv8p-q78v. Update the shared dependency catalog and matching types used by Miniflare and Wrangler so downstream installs can resolve the patched runtime without an application-level override. A published release is still required for consumers; this changeset does not alter already published package metadata.
