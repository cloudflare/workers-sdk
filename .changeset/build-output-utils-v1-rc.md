---
"@cloudflare/build-output-utils": major
---

Release the first `1.0.0` release candidate, which reads and writes Build Output v1

Build Output now lives in `.cloudflare/output/v1/`. Only the `.cloudflare/output/v<N>/` naming convention is permanent: a future breaking change to the format would use a new version directory. `readBuildOutput()` lists the version directories first and throws a `BuildOutputError` unless it finds exactly one `v1` directory. This means output written by an older or newer tool, or a stale `v0` tree left next to a fresh one, fails with a clear error instead of being misread or deployed.

`BuildOutputError` now has a `code` (`not-found`, `newer-version`, `older-version`, `multiple-versions`, `unknown-fields` or `invalid`) plus `foundVersions`, `supportedVersions`, `producer` and `unknownFields`. Consumers can use these to show their own advice instead of parsing the message. When a config contains fields the reader doesn't support, the error lists each field and names the tool that wrote the output.

The root `config.json` now nests account settings under `settings`, which is left out when none are set, and can record the tool that wrote the output in an optional `producer` field. `writeRootConfig()` takes an options object, matching the other `write*` functions:

```ts
// Before
await writeRootConfig(root, settings, buildContext);

// After
await writeRootConfig({
	root,
	settings,
	buildContext,
	producer: { name: "my-framework-adapter", version: "1.2.3" },
});
```
