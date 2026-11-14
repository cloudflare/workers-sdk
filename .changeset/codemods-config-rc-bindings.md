---
"@cloudflare/codemods": patch
---

Generate the release candidate `@cloudflare/config` field names in `wrangler-to-cf`

The codemod now writes:

- `first_party_worker` as `experimental.firstPartyWorker`
- Pipelines bindings as `bindings.pipeline({ streamId })`
- K2 bindings as `bindings.k2({ id })`
- the Analytics SQL binding as `bindings.analyticsSql()`

A Pipelines binding that uses the deprecated `pipeline` field gets a `STREAM_ID` placeholder and a follow-up asking for the stream ID, because that field names a legacy pipeline, which `@cloudflare/config` doesn't support.
