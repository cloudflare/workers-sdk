# Artifacts observable contract (draft)

`../contract.spec.ts` runs `runScenarios()` against Miniflare's real RPC binding, with a deterministic, locally pushed Git fixture. The shared scenarios capture returned objects, errors (`name`, `message`, `code`, `numericCode`), Blob MIME types and bytes, and missing/null outcomes. They cover namespace create/get/list/delete (including case and pagination boundaries), retained handles after delete/recreate, tokens and wrong-repository revocation, Git objects/files/refs, and empty/branch-selective/read-only forks. Git HTTP authorization is covered separately in `../index.spec.ts`; this suite does not expose a public RPC HTTP endpoint.

**Do not treat local observations as an approved remote specification.** The comparator reports field-level differences without updating either side. It normalizes only identity fields (`id`, `token`, `plaintext`), ISO timestamp fields, and the port of a loopback `remote` URL. In particular, error strings/codes, Blob bytes/types, Git hashes, cursor behavior, object fields, and non-loopback remote URLs remain exact. A non-loopback live remote compared to a loopback local remote will be reported, not silently accepted. Traces include credentials before comparison: do not print, persist, or upload raw observations. The comparison API returns normalized mismatches only.

## Optional manual comparison (not run by CI)

There is **no** standalone CLI, deploy script, automatic provisioning, authentication helper, or remote endpoint in this directory. After the namespace owner explicitly approves a **disposable** namespace and a unique fixture prefix, a trusted private test environment may obtain two real binding objects (local and live) and call `runApprovedLiveComparison` from `live.ts` in-process. Pass:

- `namespace` and the identical `approvedDisposableNamespace` confirmed by the owner (the harness cannot verify binding-to-namespace mapping);
- `fixturePrefix` and the identical `approvedDisposableFixturePrefix` confirmed by the owner: a fresh lowercase prefix ending in `-` (for example, `contract-sample-`), reserved solely for this run. The preflight refuses a namespace containing _any_ repositories, because list counts and cursors are global;
- the literal `confirmation: "I_APPROVE_DISPOSABLE_ARTIFACTS_COMPARISON"`;
- `local`, `live`, and `prepareLocalFixture` / `prepareLiveFixture` callbacks. Each callback receives a fresh repo's `remote` and a short-lived write `token` and must push the same two main commits and one feature commit as the local fixture, using a protected credential channel (not argv, logs, or committed files). Supply bindings through an authorized Worker/test context, **not** an unrestricted public RPC fetch route.

Never pass a production namespace, existing repository, shared prefix, or resource credential through a command line. The harness deletes only repository names whose create/fork RPC returned success in this run; it never deletes a namespace or provisions/deploys a Worker. A failed RPC may still have created a resource; inspect partial failures manually with owner approval. Concurrent writers to the same namespace are not safe: reserve the namespace for the duration of the run. Cleanup failures throw; inspect and remove only the named fixtures with owner approval. Do not run a live comparison without explicit authorization. The local spec is the only automatically executed path.

## Unresolved contract decisions

- Remote ownership/authorization, namespace-to-binding mapping, exclusive namespace reservation and disposal approval require an actual owner; none is implied by this test harness.
- Exact production behavior for missing/wrong-type Git objects, commit-hash refs, path normalization, malformed cursors, token visibility/revocation, and retained handles requires an approved remote run. Current local handle errors can differ between direct binding proxy and an in-Worker call; do not rewrite error observations to hide this.
- A returned production Git remote will not be normalized to the local loopback URL. Its difference needs an explicit owner decision, not a comparator exception.
- Local-only regression assertions are not evidence of live platform parity. No production calls have been made by this workstream.
