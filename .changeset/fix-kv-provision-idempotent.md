---
"wrangler": patch
---

Reuse existing KV namespace instead of erroring with `10014` on re-deploy

When `wrangler deploy` is run with auto-provisioning (the default; used by Workers Builds and `--x-auto-create=true`), and a `kv_namespaces` binding has no `id`, the provisioning flow always called `kv.namespaces.create()` with the default `<worker>-<binding>` title. On subsequent deploys the title already existed from the first deploy, so the Cloudflare API returned `a namespace with this account ID and title already exists [code: 10014]` and the deploy failed.

The flow now scans the loaded list of existing resources first and connects to the one whose title matches the resolved name (default `<worker>-<binding>` for the auto-create path, or the user-supplied name when set in config), only falling back to `create()` when no match is found. Same change applied to the `item.handler.name` branch so user-provided names with a pre-existing namespace are reused rather than erroring. R2 buckets are deliberately excluded from this lookup since the loaded list does not carry jurisdiction, so a same-name bucket in a different jurisdiction would be misidentified — for R2 the flow keeps its existing behavior of calling `provision()` directly.
