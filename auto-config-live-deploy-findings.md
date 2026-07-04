# Auto-Config Live Deploy Findings

Date: 2026-07-04

Wrangler build: local `packages/wrangler/bin/wrangler.js`, version `4.107.0`, built from this branch.

Cloudflare account: `6ca3fa16f4f94a6d565cdf361cab3b48` (`Roundtrip`).

Fixture root: `/var/folders/1q/b9f9sbzs587dgy7fx11cn6fm0000gn/T/opencode/autocfg-live-20260704`.

## Summary

The no-write static deploy flows work against a real account, and the generated Express wrappers work when deployed through the generated `wrangler.jsonc` config. The live run found several important issues that unit tests did not fully exercise:

- Persistent explicit-target adapters, like Express and Dockerfile, generate config but then deploy continues to use the original positional target. This makes direct `wrangler deploy server.js` and `wrangler deploy src/index.ts` fail immediately after setup.
- Immediate live URL verification repeatedly records false `404` failures even though the deployed URL serves correctly a few seconds later.
- Deploying a current directory as static assets can publish `.wrangler/tmp/...` files and the configured `WRANGLER_OUTPUT_FILE_PATH` file if those live under the asset directory. This also happens in the existing ungated raw-assets path, but the gated lower-ceremony path makes it easier to hit.
- Containers setup works only in an interactive TTY. In this automation environment it rejected normal non-interactive setup; using a pseudo-TTY worked, but surfaced duplicated warnings and package-manager/hint inconsistencies.
- After Docker Desktop was started, Containers deploy built the image locally but failed at image push/listing with `The image registry does not exist`. This appears to be account/container-registry setup rather than Docker availability or generated Dockerfile shape.

## Commands And Results

### Single HTML File

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=output.json node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js deploy index.html --name autocfg-live-single-html --compatibility-date 2026-07-04
```

Result:

- Deployed successfully to `https://autocfg-live-single-html.roundtrip.workers.dev`.
- Live fetch returned `single-html ok`.
- No local config was written.
- `output.json` included `autoconfig` and `deploy` entries with `adapterId: "single-file-site"`.
- Issue: `url_verification` recorded `{ "status": "failure", "status_code": 404 }`, but a follow-up fetch succeeded.

### Named HTML File

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=output.json node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js deploy landing.html --name autocfg-live-named-html --compatibility-date 2026-07-04
```

Result:

- Deployed successfully to `https://autocfg-live-named-html.roundtrip.workers.dev`.
- Root path returned `named-html ok`.
- `/landing.html` returned `404`.
- Issue: non-`index.html` files are copied to `/index.html`, so the original filename does not exist after deploy. This may be acceptable for a single-file-site abstraction, but it is surprising enough to document or reconsider.
- Issue: `url_verification` again recorded a `404` false negative.

### Static Folder, Gated, Invoked From Inside Asset Directory

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=output-gated.json node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js deploy . --name autocfg-live-static-folder --compatibility-date 2026-07-04 --experimental-auto-config-static-assets
```

Result:

- Deployed successfully to `https://autocfg-live-static-folder.roundtrip.workers.dev`.
- Root path and `/main.css` served correctly.
- Issue: asset upload included files that should not be public:
  - `/.wrangler/tmp/deploy-NRAx3x/no-op-worker.js`
  - `/.wrangler/tmp/deploy-NRAx3x/no-op-worker.js.map`
  - `/output-gated.json`
- Confirmed those uploaded files were publicly accessible.
- Issue: `url_verification` recorded a `404` false negative.

### Static Folder, Ungated Baseline, Invoked From Inside Asset Directory

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=output-ungated.json node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js deploy . --name autocfg-live-static-ungated --compatibility-date 2026-07-04
```

Result:

- Deployed successfully to `https://autocfg-live-static-ungated.roundtrip.workers.dev`.
- The same asset pollution behavior occurred in the existing raw-assets path:
  - `/.wrangler/tmp/deploy-Z4ac1P/no-op-worker.js`
  - `/.wrangler/tmp/deploy-Z4ac1P/no-op-worker.js.map`
  - `/output-ungated.json`
- This means the issue is not introduced by the gated auto-config path, but the new workflow may make it more likely.

### Static Folder, Gated, Invoked From Parent Directory

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=parent-static-output.json node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js deploy static-folder-parent --name autocfg-live-static-parent --compatibility-date 2026-07-04 --experimental-auto-config-static-assets
```

Result:

- Deployed successfully to `https://autocfg-live-static-parent.roundtrip.workers.dev`.
- Live fetch returned `static-folder-parent ok`.
- Uploaded only the intended asset files.
- Issue: detected project display showed `Worker Name: autocfg-live-20260704` from the parent directory, while the actual deployed Worker was `autocfg-live-static-parent` due to `--name`.
- Issue: `url_verification` recorded a `404` false negative.

### Static Vite-Style App, Gated

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=vite-output.json node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js deploy static-vite-app --name autocfg-live-static-vite --compatibility-date 2026-07-04 --experimental-auto-config-static-assets
```

Result:

- Auto-config detected `Static package app` with medium confidence.
- Ran `pnpm run build` in the app directory.
- Deployed `dist/` successfully to `https://autocfg-live-static-vite.roundtrip.workers.dev`.
- Root path returned `static-vite-app ok`.
- `/app.js` served correctly.
- Issue: `url_verification` recorded a `404` false negative.

### Static Vite-Style App With Missing `dist/index.html`

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=vite-broken-output.json node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js deploy static-vite-broken --name autocfg-live-static-vite-broken --compatibility-date 2026-07-04 --experimental-auto-config-static-assets
```

Result:

- Auto-config detected the static package app and ran `pnpm run build`.
- Build created `dist/not-index.html`, but no `dist/index.html`.
- Deploy failed cleanly with:

```text
Static app auto-configuration expected the build output to contain an index.html file. Check your build command or deploy the output directory explicitly with --assets.
```

- `vite-broken-output.json` included a `command-failed` entry with the same message.
- This behavior looked good.

### Plain Worker Script

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=output.json node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js deploy index.js --name autocfg-live-plain-worker --compatibility-date 2026-07-04
```

Result:

- Deployed successfully to `https://autocfg-live-plain-worker.roundtrip.workers.dev`.
- Live fetch returned `plain-worker ok`.
- Output contained only `wrangler-session` and `deploy`; no `autoconfig` entry.
- This confirms the plain Worker script fallback behavior is preserved.

### Express JS, Direct Explicit Entrypoint

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=deploy-direct-output.json node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js deploy server.js --name autocfg-live-express-js-direct --compatibility-date 2026-07-04
```

Result:

- Auto-config detected `Express Node HTTP server` and generated:
  - `src/worker.js`
  - `wrangler.jsonc`
  - `deploy` and `preview` package scripts
- It installed Wrangler as a dev dependency.
- Deploy then failed with a bundling error saying the Worker had no default export and appeared to be Service Worker format.
- Root cause: after persistent auto-config, deploy still honored the original positional `server.js` as `args.script`; `args.script` won over the generated `wrangler.jsonc` `main: "src/worker.js"`.

Follow-up command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=deploy-config-output.json node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js deploy --name autocfg-live-express-js-config
```

Follow-up result:

- Deployed successfully to `https://autocfg-live-express-js-config.roundtrip.workers.dev`.
- Live fetch returned `express-js ok`.
- This confirms the generated wrapper is valid; the bug is deploy orchestration after explicit-target persistent auto-config.

### Express TS, Direct Explicit Entrypoint

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=deploy-direct-output.json node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js deploy src/index.ts --name autocfg-live-express-ts-direct --compatibility-date 2026-07-04
```

Result:

- Auto-config detected `Express Node HTTP server` and generated:
  - `src/worker.ts`
  - `wrangler.jsonc`
  - `deploy`, `preview`, and `cf-typegen` package scripts
- Deploy then uploaded the original `src/index.ts`, not the generated wrapper, and Cloudflare rejected it:

```text
The uploaded script has no registered event handlers. [code: 10068]
```

- Same root cause as Express JS: original positional target was not cleared after persistent auto-config.

Follow-up command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=deploy-config-output.json node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js deploy --name autocfg-live-express-ts-config
```

Follow-up result:

- Deployed successfully to `https://autocfg-live-express-ts-config.roundtrip.workers.dev`.
- Live fetch returned `express-ts ok`.

Additional output issue:

- The `command-failed` entry for the API rejection only contained the generic API request message and `code: 10068`, not the more useful details about missing event handlers. The terminal output had the detailed message.

### Dockerfile Containers Setup, Normal Non-Interactive Shell

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=setup-output.json node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js setup --yes --install-wrangler=false --experimental-auto-config-containers
```

Result:

- Failed immediately with:

```text
Dockerfile-to-Containers auto-configuration currently requires an interactive local session.
```

- This is expected from the current gate, but it means automation and coding-agent usage cannot exercise this path without a TTY workaround.

### Dockerfile Containers Setup, Pseudo-TTY

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=setup-output-tty.json script -q /dev/null node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js setup --yes --install-wrangler=false --experimental-auto-config-containers
```

Result:

- Setup succeeded and generated:
  - `src/worker.js`
  - `wrangler.jsonc` with `containers`, `durable_objects`, and `migrations`
  - `deploy` and `preview` scripts
- Installed `@cloudflare/containers`.
- Issues:
  - Docker/Paid-plan/provisioning warnings printed twice.
  - Summary said `wrangler (devDependency)` would be installed even with `--install-wrangler=false`; it was not actually added to `package.json`.
  - Final message said `You can now deploy with npm run deploy` even though a `pnpm-lock.yaml` was present and setup used `pnpm install @cloudflare/containers`.
  - `setup-output-tty.json` had `wranglerInstall: true` despite `--install-wrangler=false`.

### Dockerfile Containers Deploy, Docker Daemon Not Running

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=deploy-output.json node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js deploy --name autocfg-live-dockerfile-node
```

Result:

- Failed before upload with a clear Docker message:

```text
The Docker CLI is needed to build the configured image before deploying but could not be launched.
```

- The message gave actionable next steps and suggested `--containers-rollout=none`.

### Dockerfile Containers Deploy, Docker Daemon Running

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=deploy-full-output.json node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js deploy
```

Result:

- Docker was available and Wrangler successfully built the configured image locally:
  - Image name: `autocfg-live-dockerfile-node:01692633`
  - Base image: `node:22-alpine`
  - Build context and Dockerfile shape looked correct.
- Deploy failed after the local image build with:

```text
The image registry does not exist
```

- `deploy-full-output.json` contained only `wrangler-session` and `command-failed`, with no additional diagnostic detail.
- Running `wrangler containers build . -t autocfg-live-manual-container:latest --push` from the same fixture produced the same registry error after a successful local build.
- Running `wrangler containers images list` for the same account also returned `The image registry does not exist`.
- Running `wrangler containers list` succeeded and showed existing ready container applications in the account, so the registry failure is narrower than general Containers API access.

Interpretation:

- The generated Dockerfile/Containers project can reach the local build stage.
- Full live rollout remains unverified because the account's image registry endpoint is unavailable or not provisioned for this credential/account state.
- This should be tracked separately from auto-config adapter correctness unless another account with a working registry reproduces the same failure.

### Dockerfile Containers Deploy With `--containers-rollout=none`

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=deploy-rollout-none-output.json node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js deploy --name autocfg-live-dockerfile-node-none --containers-rollout=none
```

Result:

- Worker deployed successfully to `https://autocfg-live-dockerfile-node-none.roundtrip.workers.dev`.
- Live request first timed out, then returned `500` on retry.
- This is probably expected because no container image was built or rolled out, but it is worth documenting because the CLI suggests this flag as a workaround for missing Docker.

### Dockerfile Direct Deploy Through Pseudo-TTY

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=6ca3fa16f4f94a6d565cdf361cab3b48 WRANGLER_OUTPUT_FILE_PATH=deploy-direct-output.json script -q /dev/null node /Users/brendan/src/workers-sdk/packages/wrangler/bin/wrangler.js deploy Dockerfile --name autocfg-live-dockerfile-direct --compatibility-date 2026-07-04 --experimental-auto-config-containers
```

Result:

- Prompted for `Do you want to modify these settings?` and defaulted to `no` via pseudo-TTY EOF.
- The command stopped after the prompt and wrote only a `wrangler-session` entry. It did not write a `command-failed` entry.
- This was not conclusive for full direct Dockerfile deploy behavior, but it shows that direct persistent auto-config is awkward to automate because `wrangler deploy` has no `--yes` flag.

## Prioritized Issues To Fix Or Decide

### 1. Persistent Explicit-Target Deploy Keeps Original `args.script`

Severity: high.

Affected examples:

- `wrangler deploy server.js` in Express JS project.
- `wrangler deploy src/index.ts` in Express TS project.
- Likely `wrangler deploy Dockerfile` if it proceeds past setup.

Observed behavior:

- Auto-config successfully writes generated wrapper/config.
- Deploy then bundles/uploads the original explicit target instead of the generated `config.main`.

Expected behavior:

- After a persistent explicit-target adapter successfully writes config, deploy should clear or reinterpret the original positional `args.path`/`args.script` so the generated config controls the deploy.

### 2. URL Verification Produces False 404 Failures

Severity: high for machine-readable output trust.

Observed across:

- Single HTML file.
- Named HTML file.
- Static folder from parent.
- Static Vite-style app.

Observed behavior:

- `url_verification` immediately records `{ status: "failure", status_code: 404 }`.
- A follow-up fetch moments later succeeds.

Potential improvements:

- Retry for a bounded period after deploy.
- Treat initial 404 as transient for freshly deployed Workers.
- Record `pending` or `eventual-success` semantics if retry succeeds.

### 3. Static Asset Directory Pollution When Deploying `.`

Severity: medium/high.

Observed behavior:

- Deploying `.` uploaded `.wrangler/tmp/deploy-*/no-op-worker.js`, sourcemaps, and `WRANGLER_OUTPUT_FILE_PATH` when the output file lived inside the asset directory.
- Confirmed in both gated and ungated paths.

Potential improvements:

- Ensure `.wrangler/` is excluded from asset uploads by default.
- Warn if `WRANGLER_OUTPUT_FILE_PATH` points inside the asset directory.
- For no-write static folder deploys, consider staging assets into a temp directory with default ignores applied.

### 4. Non-`index.html` Single File Path Semantics

Severity: medium.

Observed behavior:

- `wrangler deploy landing.html` serves that file at `/`, not `/landing.html`.

Decision needed:

- Either document that single-file site deploy always normalizes to `/index.html`, or preserve the original basename as an additional asset path.

### 5. Containers Setup UX Inconsistencies

Severity: medium.

Observed behavior:

- Warnings printed twice during setup.
- `--install-wrangler=false` still showed `wrangler (devDependency)` in the summary and `wranglerInstall: true` in output.
- Final deploy hint used `npm run deploy` even though setup used pnpm based on a lockfile.

Potential improvements:

- Make summaries reflect disabled Wrangler installation.
- De-duplicate warnings between display and summary.
- Reuse the detected package manager from auto-config details for the final setup message.

### 6. Containers Registry Setup/Error Surface

Severity: medium.

Observed behavior:

- With Docker running, generated Containers deploy built locally and then failed at push/list/image operations with `The image registry does not exist`.
- The account can list existing container applications, so the failure does not look like a generic Containers entitlement failure.

Potential improvements:

- If this registry state is expected for some accounts, Wrangler should surface a targeted next step or setup command before starting a local Docker build.
- If this state is unexpected, document it as an account/product setup blocker for live validation and re-test on an account with a known working image registry.

### 7. Command-Failed Output Can Lose Useful API Error Details

Severity: low/medium.

Observed behavior:

- Express TS direct deploy terminal output included the useful missing-handler API details.
- `WRANGLER_OUTPUT_FILE_PATH` `command-failed` entry only included the generic API request failure message and code.

Potential improvement:

- Include sanitized API error detail text in structured command-failed output where safe.

## Workers Created

These Workers were created in the Roundtrip account during testing:

- `autocfg-live-single-html`
- `autocfg-live-named-html`
- `autocfg-live-static-folder`
- `autocfg-live-static-ungated`
- `autocfg-live-static-parent`
- `autocfg-live-static-vite`
- `autocfg-live-plain-worker`
- `autocfg-live-express-js-config`
- `autocfg-live-express-ts-config`
- `autocfg-live-dockerfile-node-none`

Failed deploy attempts did not create working Workers for:

- `autocfg-live-static-vite-broken`
- `autocfg-live-express-js-direct`
- `autocfg-live-express-ts-direct`
- `autocfg-live-dockerfile-node`
- `autocfg-live-dockerfile-direct`

Additional failed Containers registry checks:

- `wrangler containers build . -t autocfg-live-manual-container:latest --push` failed after local image build with `The image registry does not exist`.
- `wrangler containers images list` failed with `The image registry does not exist`.
