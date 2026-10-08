---
"wrangler": patch
---

Allow `wrangler dev` to start module Workers without a default export

Previously, `wrangler dev` failed to start module Workers that exported only named entrypoints, such as RPC services, unless an unused default export was added. These Workers now start normally in local development without that workaround.
