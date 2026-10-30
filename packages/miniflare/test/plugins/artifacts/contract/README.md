# Artifacts local contract tests

`../contract.spec.ts` runs shared scenarios against Miniflare's real RPC binding with a deterministic, locally pushed Git fixture. The scenarios assert returned objects, error fields, Blob MIME types and bytes, missing/null outcomes, repository lifecycle, tokens, Git objects and files, and forks. Git HTTP authorization is tested separately in `../index.spec.ts`. The scenarios refuse a nonempty namespace and clean up repositories they create.

These tests exercise only local behavior. They do not contact deployed Artifacts or establish parity with it. Comparing against the deployed service requires an approved, exclusively reserved disposable namespace; never run these scenarios against shared or production data.
