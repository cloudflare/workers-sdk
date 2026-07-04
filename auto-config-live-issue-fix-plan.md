# Auto-Config Live Issue Fix Plan

Date: 2026-07-04

Status: fixes implemented locally; targeted tests and type checks passed except focused live redeploys still pending.

Source evidence: `auto-config-live-deploy-findings.md`.

## Goals

- Fix the high-confidence bugs found by live deploys without broadening rollout scope.
- Preserve existing deploy behavior for explicit targets that no adapter claims.
- Keep static directory/static app and Containers behavior behind their current experimental gates.
- Keep machine-readable output useful and stable for automation.
- Retest with unit tests first, then focused live deploys.

## Non-Goals

- Do not make Containers auto-config generally available.
- Do not remove the interactive-session requirement for Dockerfile-to-Containers auto-config unless the product decision changes.
- Do not redesign single-file-site routing beyond preserving the original basename alongside `/`.
- Do not attempt to fix account-level Containers registry provisioning inside auto-config.

## Recommended Sequence

1. Fix persistent explicit-target deploy orchestration.
2. Remove live URL verification.
3. Fix setup output/package-manager/warning inconsistencies.
4. Add asset-upload safety defaults and output-file protection.
5. Publish non-`index.html` single-file deploys at both `/` and their original filename.
6. Improve structured `command-failed` diagnostics.
7. Skip Containers registry preflight/error-message work for now.
8. Re-run targeted CI and live validation.

## Decision Log

- Persistent explicit-target deploy: do it. Keep the generated Worker wrapper and make the first deploy use the generated config rather than editing the user's server file in place.
- URL verification: remove it. This behavior did not exist before this branch and adds complexity/false negatives.
- Containers setup UX cleanup: do it.
- Asset upload safety: do it. Default-ignore root `.wrangler/**`, but keep `.assetsignore` negation overrides working.
- Non-`index.html` single-file deploy: publish at both `/` and the original filename.
- Structured `command-failed` details: do it.
- Containers registry preflight/error message: skip for now.

## 1. Persistent Explicit-Target Deploy Uses Generated Config

Problem:

- Express and likely Dockerfile explicit-target adapters write a valid `wrangler.jsonc`, then deploy still uses the original positional target because `args.script` or `args.path` remains set.
- In `packages/wrangler/src/deploy/index.ts`, `mergeDeployConfigArgs(args, config)` runs after auto-config.
- In `packages/wrangler/src/deploy/autoconfig.ts`, persistent auto-config rereads config at `readConfig(args, ...)` but does not clear the old explicit target interpretation.
- `getEntry()` later gives `args.script` priority over `config.main`.

Implementation:

- Implemented `applyPersistentAutoConfigDeployTarget()` in `packages/wrangler/src/deploy/autoconfig.ts`.
- The helper clears only original target fields (`args.path`, `args.script`, `args.assets`) for persistent explicit-target auto-config after a generated config is written.
- Non-target deploy flags remain untouched, including `--name` and `--compatibility-date`.
- No-write adapters and unmatched explicit Worker scripts remain on their existing paths.

Tests:

- Added Wrangler deploy tests in `packages/wrangler/src/__tests__/deploy/entry-points.test.ts` for direct Express JS and TS deploys that assert the generated wrapper entrypoint wins over the original server file.
- Kept the plain Worker explicit target guardrail test.
- Dockerfile explicit-target follow-up remains covered by live setup validation rather than a new unit test in this pass.

Acceptance Criteria:

- `wrangler deploy server.js --name example` auto-configures Express and deploys `src/worker.js`, not `server.js`.
- `wrangler deploy src/index.ts --name example` auto-configures Express and deploys `src/worker.ts`, not `src/index.ts`.
- Existing explicit Worker deploy behavior is unchanged when no adapter matches.

## 2. Remove Live URL Verification

Problem:

- URL verification was added on this branch; previous auto-config behavior did not fetch the deployed URL after deployment.
- `maybeVerifyDeploymentUrl()` in `packages/wrangler/src/deploy/index.ts` performs one immediate GET with a 5 second timeout.
- Live Workers repeatedly returned `404` to that first request but served successfully shortly afterward.
- The extra check adds complexity and false negatives to machine-readable output.

Implementation:

- Removed `maybeVerifyDeploymentUrl()` from `packages/wrangler/src/deploy/index.ts`.
- Removed the `url_verification` field from deploy output schema and emit path.
- Kept `live_url` for auto-config deployments.

Tests:

- Updated Wrangler deploy/output tests to remove `url_verification` expectations.
- Existing live URL reporting remains covered by auto-config deploy output assertions.

Acceptance Criteria:

- Auto-config deploys no longer perform an HTTP request to the deployed URL.
- Machine-readable deploy output still includes the deployed URL via `live_url`.

## 3. Containers Setup UX Inconsistencies

Problem:

- Container warnings print in `displayAutoConfigDetails()` and again in `buildConfigurationPlanSummary()`.
- `buildConfigurationPlanSummary()` sets `wranglerInstall: true` for persistent package projects even when `enableWranglerInstallation` is false.
- `setup.ts` computes the final deploy command with `getPackageManager()` from the current directory rather than using `details.packageManager`, which produced `npm run deploy` even in a pnpm project.

Implementation:

- Updated `packages/autoconfig/src/run.ts` so configuration-plan summaries honor `enableWranglerInstallation` and suppress the Wrangler install summary when installation is disabled.
- Removed duplicate configuration warning output from the operation summary path.
- Updated `packages/wrangler/src/setup.ts` to use `details.packageManager.type` for the final deploy hint.

Tests:

- Updated `packages/autoconfig/tests/run-project-adapters.test.ts` for `wranglerInstall: false` when `enableWranglerInstallation: false`.
- Updated `packages/wrangler/src/__tests__/setup.test.ts` for package-manager deploy hints.
- Added/updated log assertions covering warning output behavior.

Acceptance Criteria:

- `wrangler setup --install-wrangler=false` output and structured JSON both show no Wrangler install.
- The final deploy hint uses the detected package manager.
- Container warnings appear once.

## 4. Static Asset Directory Pollution

Problem:

- Deploying `.` as assets uploaded `.wrangler/tmp/...` files and the `WRANGLER_OUTPUT_FILE_PATH` file when that output file was inside the asset directory.
- This happens in the existing raw-assets path as well as the gated auto-config path.
- Shared asset ignores currently default-ignore only root `.assetsignore`, `_redirects`, and `_headers` in `packages/workers-shared/utils/helpers.ts`.

Implementation:

- Added `/.wrangler/**` to `createAssetsIgnoreFunction()` in `packages/workers-shared/utils/helpers.ts`.
- Kept `.assetsignore` override behavior intact; `!/.wrangler/**` can still force opt-in.
- Added output-file exclusion in `packages/deploy-helpers/src/deploy/helpers/assets.ts` when `WRANGLER_OUTPUT_FILE_PATH` resolves inside the selected assets directory.
- Wrangler warns when that output file is excluded from upload.
- Miniflare behavior is unchanged beyond the shared default ignore semantics.

Tests:

- Updated `packages/workers-shared/utils/tests/helpers.test.ts` for default `.wrangler` ignores and explicit opt-in.
- Added Wrangler deploy coverage that asset manifests omit `.wrangler/tmp/...` and in-directory output JSON while warning about the excluded output file.

Changeset:

- Added `@cloudflare/workers-shared` and `@cloudflare/deploy-helpers` patch entries to the existing changeset.

Acceptance Criteria:

- Deploying `.` no longer publishes `.wrangler/tmp/deploy-*` files.
- The structured output file is not published when it lives inside the asset directory.
- Existing asset uploads remain otherwise unchanged.

## 5. Publish Non-`index.html` Single Files At Root And Filename

Problem:

- `wrangler deploy landing.html` currently copies the file to temporary `index.html`, so `/` works but `/landing.html` returns `404`.
- This may be acceptable for a single-file-site abstraction, but live behavior is surprising.

Decision:

- Copy the source file to both `index.html` and its original basename in the temporary assets directory.
- This gives the simple one-page-site behavior at `/` while also preserving the filename the user explicitly deployed.

Implementation:

- Updated `prepareNoWriteDeployment()` for `single-html-file` to copy the source to `index.html` and also to `basename(sourcePath)` when the basename is not `index.html`.
- Temporary directory cleanup is unchanged.
- Added deploy coverage that `landing.html` produces both root and `/landing.html` assets in the uploaded manifest.

Acceptance Criteria:

- `wrangler deploy landing.html` serves the same file at both `/` and `/landing.html`.
- `wrangler deploy index.html` continues to serve `/` and does not create duplicate unnecessary assets.

## 6. Structured `command-failed` Diagnostics

Problem:

- Terminal output can include API error notes that are lost in the `command-failed` output entry.
- `register-yargs-command.ts` currently writes only `code` and `message`.
- `APIError` extends `ParseError` and can carry `notes`, `status`, and `meta.details`.

Implementation:

- Extended `OutputEntryCommandFailed` in `packages/wrangler/src/output.ts` with optional `status`, `details`, and `api_errors` fields.
- Added `getCommandFailedOutputFields()` in `packages/wrangler/src/core/register-yargs-command.ts` to conservatively extract API error status, notes, and simple API error entries.
- Kept `message` and `code` unchanged for backward compatibility.

Tests:

- Added focused output coverage for `APIError` command-failed fields.

Acceptance Criteria:

- `command-failed` output includes the same actionable API detail text users see in terminal output for safe API errors.
- Existing consumers that read `message` and `code` continue to work.

## 7. Containers Registry Follow-Up Skipped For Now

Problem:

- With Docker running, generated Containers deploy built locally but failed with `The image registry does not exist`.
- `wrangler containers build --push` and `wrangler containers images list` failed with the same message.
- `wrangler containers list` succeeded.

Implementation:

- Do not change auto-config or Containers code for this issue in the current pass.
- Keep the registry failure documented in `auto-config-live-deploy-findings.md`.
- Revisit only if a working-registry account reproduces the issue or product confirms this is an expected account state Wrangler should preflight.

Tests:

- No unit test is required for auto-config unless the Containers command path adds a new preflight or error mapper.
- If an error mapper is added, test `The image registry does not exist` maps to a targeted next-step message.

Acceptance Criteria:

- No code changes are made for this issue in the current pass.
- Full Containers live rollout remains unclaimed until retested on an account with a working image registry.

## Verification Plan

CI/local commands:

```sh
pnpm --filter @cloudflare/autoconfig check:type
pnpm --filter @cloudflare/autoconfig test:ci -- tests/details/get-details-for-auto-config.test.ts tests/run-project-adapters.test.ts
pnpm -w test:ci -F wrangler -- deploy/entry-points.test.ts
pnpm -w test:ci -F wrangler -- setup.test.ts
pnpm --filter wrangler check:type
git diff --check
```

Add these if shared asset packages change:

```sh
pnpm --filter @cloudflare/workers-shared test:ci
pnpm --filter @cloudflare/deploy-helpers test:ci
```

Completed local verification:

```sh
pnpm --filter @cloudflare/autoconfig test:ci -- tests/run-project-adapters.test.ts
pnpm -w test:ci -F wrangler -- deploy/entry-points.test.ts
pnpm -w test:ci -F wrangler -- setup.test.ts output.test.ts
pnpm --filter @cloudflare/workers-shared test:ci
pnpm --filter @cloudflare/deploy-helpers test:ci
pnpm --filter wrangler check:type
pnpm --filter @cloudflare/autoconfig check:type
```

Pending local verification:

```sh
git diff --check
```

Focused live validation after code changes:

- Re-run direct Express JS deploy with positional `server.js` and assert the live URL responds.
- Re-run direct Express TS deploy with positional `src/index.ts` and assert the live URL responds.
- Re-run single HTML and static Vite-style deploys and assert deploy output includes `live_url` but no `url_verification` field.
- Re-run `landing.html` deploy and assert both `/` and `/landing.html` work.
- Re-run static folder deploy from inside the asset directory and verify `.wrangler/tmp` and output JSON are not public.
- Re-run Containers setup for Dockerfile with pseudo-TTY and verify warnings/output/package-manager hints.
- Re-run full Containers deploy only after a working image registry is available.

## Open Decisions

- Should Containers direct deploy gain a `--yes` equivalent, or should users use `wrangler setup --yes` followed by `wrangler deploy` for automation?
- What is the correct product-level remediation for `The image registry does not exist`?
