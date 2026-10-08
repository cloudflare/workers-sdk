# Develop with local Artifacts

## Prerequisite: Git

This first version of the local Artifacts emulator requires Git installed globally on your development machine, with `git` available on the PATH of the process starting Wrangler, Vite, or Workers Vitest. Run `git --version` in that environment before starting the dev server or tests. If Git is missing or cannot run, local Artifacts fails at startup with installation instructions instead of waiting for a repository operation. Restart your dev tool after installing Git so it picks up the updated PATH.

A binding with `"remote": true` does not start the local emulator and does not need local Git. Production Artifacts also does not require Git on your machine. We plan to open-source a JavaScript Git engine in the future; it is not part of this initial local release, which uses native Git.

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

To try this unreleased feature from the Workers SDK checkout, install its dependencies and build Miniflare and Wrangler, then start the checkout's CLI from the app directory:

```sh
# From the workers-sdk root:
pnpm install --frozen-lockfile
pnpm --filter miniflare build
pnpm --filter wrangler build

# From your app directory, using the absolute path to this checkout:
node /path/to/workers-sdk/packages/wrangler/bin/wrangler.js dev --port=0 --inspector-port=0
```

Open the URL on Wrangler's `Ready on` line. With `@cloudflare/vite-plugin`, use the same Wrangler config with `cloudflare()` in your Vite config and start the Vite dev server. In Workers Vitest, point `cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })` at this config. These paths share the Miniflare implementation. To force local behavior explicitly, add `"remote": false` to the binding. The absence of `remote` is also local; this differs from older development behavior that implicitly used a remote Artifacts resource. Do not rely on production repositories being available locally.

A Worker can create and inspect a local repository:

```ts
const created = await env.REPOS.create("demo");
const repo = await env.REPOS.get("demo");
const listing = await env.REPOS.list();
const info = await repo.info();
// created.remote is a loopback HTTP Git URL; created.token is a secret.
```

To use Git smart HTTP, use the returned `remote` URL and a repository token. If `git clone` prompts for a username and password, enter any username (for example, `git`) and use `created.token` as the password. This is an Artifacts repository token, **not** a GitHub or Cloudflare account password. A configured Git credential helper may remember a password entered at the prompt. To avoid that, supply a bearer token for one Git command without storing it in source or in a Git remote URL:

```sh
read -s REPO_TOKEN # Paste the token returned by create(); input is hidden.
printf '\n'
# Replace the URL with the `remote` value returned by create() or info().
GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraHeader \
  GIT_CONFIG_VALUE_0="Authorization: Bearer $REPO_TOKEN" \
  git clone 'http://127.0.0.1:<port>/git/examples/demo.git'
unset REPO_TOKEN
```

After pushing `hello.txt` to `main`, read it in the Worker with `await repo.readFile({ ref: "main", path: "hello.txt" })` (a `Blob`, or `null` when absent). The initial create token permits writes. Its plaintext is returned only once; if you lose it, use `repo.createToken("read")` for cloning or `repo.createToken("write")` for pushing and save the returned `plaintext` securely. Revoke tokens that are no longer needed. Avoid printing tokens or committing them to config. A plain request without a token cannot clone a private local repository. Git's URL uses an ephemeral loopback port; obtain the current URL after restarting the dev server instead of hardcoding it.

## Storage and network boundaries

Local repositories and metadata persist under the dev tool's Miniflare resource persistence path (for example, Wrangler's `.wrangler/state/` when persistence is enabled). Use the same project root and persistence settings to keep local data across reloads and restarts. Disabling persistence (for example, Vite's `persistState: false`) makes the data temporary. Local and deployed Artifacts are separate: local create, push, and delete operations do not update remote resources. To opt in to a remote binding, set `"remote": true` on that Artifacts binding and configure the credentials required by your development tool. Remote mode uses a Cloudflare proxy, not the local Git store; do not assume local data migrates to it.

To reset local state, stop the dev server first, back up any repositories you need, then delete the `artifacts/` directory inside that dev tool's resource persistence path. Older draft persisted Artifacts layouts are not automatically migrated and may require this backup-and-reset procedure. Do not delete unrelated binding data in the same persistence directory.

A local binding does not contact Cloudflare for repository operations. **Explicit imports from HTTPS Git sources are different:** they make outbound network requests from your development machine to the supplied host, including private-network hosts. Import does not follow HTTP redirects; supply the final HTTPS Git URL so credentials cannot be redirected to another destination. Imports can require authentication and may fail due to TLS certificates, connectivity, or upstream Git permissions. For a private Git CA, set `GIT_SSL_CAINFO` to the trusted CA file in the dev tool's host environment before starting the dev server. Do not disable certificate verification. After a successful import, URL credentials are omitted from the local repository metadata and Git config. In-flight process-crash recovery is not yet validated; treat partial local storage after an interrupted import as sensitive if the URL contained credentials. Treat the import URL as a secret while calling `import()` and avoid logging it. Avoid importing untrusted or private URLs in examples or tests. No remote resources are contacted by the local-only examples above.

## Troubleshooting and limits

- If startup says local Artifacts requires Git, install Git globally, check `git --version` in the dev tool's environment, and restart the tool with `git` on PATH.
- If startup rejects an older storage layout, back it up and reset only the Artifacts persistence directory; a restart alone will not convert it.
- If Git asks for a username and password, use any username and the repository token as the password. If Git reports unauthorized, check the repository, scope, expiry, and revocation; do not use a Cloudflare or GitHub account password.
- If startup reports `Address already in use`, the dev or inspector port may be occupied. Pass `--port=0 --inspector-port=0` and use the printed `Ready on` URL.
- If a Git URL stops responding after restart, get the new `remote` from the binding; the loopback listener is tied to the dev process.
- Local development is not a replica of production placement or infrastructure. The local Git endpoint is HTTP on loopback only, and local state and tokens do not transfer to a remote namespace. Miniflare Artifacts, Wrangler dev, and Vite local fixtures have passed Windows CI; Workers Vitest's Artifacts fixture has not been verified on Windows.
