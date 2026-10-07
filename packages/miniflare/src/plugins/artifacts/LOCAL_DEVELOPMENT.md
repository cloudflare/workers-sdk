# Develop with local Artifacts

Local Artifacts uses a native Git executable and stores repositories on your machine. Install Git and check `git --version` on your PATH before starting a dev server or Worker test. This external Git requirement is the current implementation choice; it is not a production Artifacts requirement.

## Configure a binding

For a Wrangler project, add an Artifacts binding to `wrangler.jsonc`:

```jsonc
{
	"name": "example-worker",
	"main": "src/index.ts",
	"compatibility_date": "2026-09-03",
	"artifacts": [{ "binding": "REPOS", "namespace": "examples" }],
}
```

Run the repository's Wrangler (`pnpm exec wrangler dev`) to develop locally. With `@cloudflare/vite-plugin`, use the same Wrangler config with `cloudflare()` in your Vite config and start the Vite dev server. In Workers Vitest, point `cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })` at this config. These paths share the Miniflare implementation. To force local behavior explicitly, add `"remote": false` to the binding. The absence of `remote` is also local; this differs from older development behavior that implicitly used a remote Artifacts resource. Do not rely on production repositories being available locally.

A Worker can create and inspect a local repository:

```ts
const created = await env.REPOS.create("demo");
const repo = await env.REPOS.get("demo");
const listing = await env.REPOS.list();
const info = await repo.info();
// created.remote is a loopback HTTP Git URL; created.token is a secret.
```

To use Git smart HTTP, use the returned `remote` URL and a repository token. For example, in a local shell, prompt for a token rather than storing it in source or a Git remote URL:

```sh
read -s REPO_TOKEN
# Replace the URL with the `remote` value returned by create() or info().
GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraHeader \
  GIT_CONFIG_VALUE_0="Authorization: Bearer $REPO_TOKEN" \
  git clone 'http://127.0.0.1:<port>/git/examples/demo.git'
unset REPO_TOKEN
```

After pushing `hello.txt` to `main`, read it in the Worker with `await repo.readFile({ ref: "main", path: "hello.txt" })` (a `Blob`, or `null` when absent). The initial create token permits writes; use `repo.createToken("read")` when only reading is needed, and revoke tokens that are no longer needed. Avoid printing tokens or committing them to config. A plain request without a token cannot clone a private local repository. Git's URL uses an ephemeral loopback port; obtain the current URL after restarting the dev server instead of hardcoding it.

## Storage and network boundaries

Local repositories and metadata persist under the dev tool's Miniflare resource persistence path (for example, Wrangler's `.wrangler/state/` when persistence is enabled). Use the same project root and persistence settings to keep local data across reloads and restarts. Disabling persistence (for example, Vite's `persistState: false`) makes the data temporary. Local and deployed Artifacts are separate: local create, push, and delete operations do not update remote resources. To opt in to a remote binding, set `"remote": true` on that Artifacts binding and configure the credentials required by your development tool. Remote mode uses a Cloudflare proxy, not the local Git store; do not assume local data migrates to it.

To reset local state, stop the dev server first, back up any repositories you need, then delete the `artifacts/` directory inside that dev tool's resource persistence path. Older draft persisted Artifacts layouts are not automatically migrated and may require this backup-and-reset procedure. Do not delete unrelated binding data in the same persistence directory.

A local binding does not contact Cloudflare for repository operations. **Explicit imports from HTTPS Git sources are different:** they make outbound network requests to the supplied host, can require authentication, and may fail due to TLS certificates, connectivity, or upstream Git permissions. For a private Git CA, set `GIT_SSL_CAINFO` to the trusted CA file in the dev tool's host environment before starting the dev server. Do not disable certificate verification. URL credentials are used only during import; the local repository metadata and Git config omit them. Treat the import URL as a secret while calling `import()` and avoid logging it. Avoid importing untrusted or private URLs in examples or tests. No remote resources are contacted by the local-only examples above.

## Troubleshooting and limits

- If startup reports Git missing, install Git and restart the tool with `git` available on PATH.
- If startup rejects an older storage layout, back it up and reset only the Artifacts persistence directory; a restart alone will not convert it.
- If Git reports unauthorized, use a valid token for this repository and the requested read/write operation; an expired or revoked token will not work.
- If a Git URL stops responding after restart, get the new `remote` from the binding; the loopback listener is tied to the dev process.
- Local development is not a replica of production placement or infrastructure. The local Git endpoint is HTTP on loopback only, and local state and tokens do not transfer to a remote namespace. Windows behavior is not validated here.
