# RFC: `wrangler compile` — standalone self-hosted workerd bundles

Status: **Phase 1 alpha IMPLEMENTED (internal, not public)** — stateless + static assets end-to-end; gated on cloudflare/workerd#6780 before any public release.
Owner: TBD (Workers: Authoring and Testing)
Scope of this doc: MVP = **stateless Worker + static assets**, output = **portable directory + Dockerfile**, exposed via a `wrangler compile` command (+ planned `@cloudflare/vite-plugin` `standalone` mode), built on **one shared core**.

---

## 0. Status at a glance

> Single source of truth for progress. Detailed write-ups: §14 (spike), §15 (miniflare core), §16 (wrangler surface). Phasing/gating: §11.

### ✅ Done — Phase 0 + Phase 1 core (landed & verified)

| Area                  | What                                                                                                                                                                        | Where                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Spike                 | Hand-stripped stateless+assets config served under bare `workerd` (worker + assets + content-types + 404, no Node)                                                          | §14 (throwaway artifacts)                                                                                              |
| Miniflare core        | `emitConfigText()` — faithful **text** Cap'n Proto emitter (embeds modules/blobs, fails loud on unsupported shapes)                                                         | `packages/miniflare/src/standalone/capnp-text.ts`                                                                      |
| Miniflare core        | `toStandaloneConfig()` — reachability-pruned production transform (drop dev services, repoint `globalOutbound`→`internet`, single `http` socket, relativize `disk`)         | `packages/miniflare/src/standalone/transform.ts`                                                                       |
| Miniflare core        | `emitStandaloneBundle()` — writes `config.capnp` + embedded files + copies `disk` assets                                                                                    | `packages/miniflare/src/standalone/emit.ts`                                                                            |
| Miniflare seam        | `Miniflare.prototype.unstable_getConfig()` — read the fully-assembled `Config` without re-deriving it                                                                       | `packages/miniflare/src/index.ts`                                                                                      |
| Config                | `"standalone": boolean` field (validated + normalized)                                                                                                                      | `packages/workers-utils/src/config/{config,validation}.ts`                                                             |
| Config                | `standalone-support.ts` binding matrix (supported vs unsupported) — single source of truth                                                                                  | `packages/workers-utils/src/config/standalone-support.ts`                                                              |
| CLI                   | `wrangler compile` command (`--outdir`, `--force`; validates → bundles via `deploy --dry-run` → Miniflare → `unstable_getConfig` → emit + Dockerfile + entrypoint + report) | `packages/wrangler/src/compile/index.ts`                                                                               |
| CLI                   | `wrangler deploy` **errors** when `standalone` set (allows `--dry-run`)                                                                                                     | `packages/wrangler/src/deploy/index.ts`                                                                                |
| CLI                   | `wrangler dev` `--standalone` flag + non-fatal **warning** on unsupported bindings                                                                                          | `packages/wrangler/src/dev.ts`, `src/standalone/validate.ts`                                                           |
| API                   | `unstable_compileStandalone()` programmatic entry point (shared by CLI + Vite)                                                                                              | `packages/wrangler/src/compile/index.ts`, exported via `src/cli.ts`                                                    |
| Vite                  | `cloudflare({ standalone: true })` — `vite build` emits the same bundle via the shared core (Vite 6 + 7/8)                                                                  | `packages/vite-plugin-cloudflare/src/plugins/standalone.ts`                                                            |
| Tests (miniflare)     | Unit + **e2e under real `workerd serve`** (incl. `fromEnvironment`)                                                                                                         | `packages/miniflare/test/standalone.spec.ts`                                                                           |
| Tests (workers-utils) | `getStandaloneSupport` matrix + `standalone` config validation                                                                                                              | `packages/workers-utils/tests/config/standalone-support.test.ts`, `…/validation/normalize-and-validate-config.test.ts` |
| Tests (wrangler)      | `compile` e2e (bundle/files; unsupported→error; `--force`) + deploy-guard / dev-warning helper unit tests                                                                   | `packages/wrangler/e2e/compile.test.ts`, `packages/wrangler/src/__tests__/standalone.test.ts`                          |
| Tests (vite)          | `standalone` resolution unit test + programmatic `buildApp()` bundle-emit integration test                                                                                  | `packages/vite-plugin-cloudflare/src/__tests__/{resolve-plugin-config,standalone-build}.spec.ts`                       |
| Release               | Changeset (`wrangler` + `miniflare`, minor)                                                                                                                                 | `.changeset/standalone-compile.md`                                                                                     |

**End-to-end verified:** `wrangler compile` on a fixture (`fetch` + `vars` + assets) → `workerd serve` served `/api/*` (dynamic + `env.GREETING`) and `/` (static); `deploy` blocked, `deploy --dry-run` allowed; `dev` warned on a KV binding. **Vite `standalone` also verified**: `vite build` on a `cloudflare({ standalone: true })` fixture emitted a bundle that served the same `/api/*` + `/` correctly under bare `workerd`.

### 🔶 Rough edges (acceptable for alpha, see §16)

- [x] User-module name leaks the dry-run temp path — fixed: `modulesRoot` is now set to the deepest common dir of the module paths, so the entry emits as `index.js`.
- [ ] Compile briefly starts `workerd` via Miniflare just to read the config — add an assemble-only path.
- [x] Unused simulator extensions (ratelimit/workflows/email/analytics/dispatch) — fixed: extension modules not referenced by a kept worker (directly or transitively) are pruned in `toStandaloneConfig` (`pruneExtensions`, default on).
- [x] Assets `disk` is emitted `writable` — fixed: `assets:*` disk services are emitted `writable = false`.

### ⬜ Left to do — Phase 1 polish (before internal-alpha "done")

- [x] **Tests across the stack:** `getStandaloneSupport` matrix + `standalone` config validation (workers-utils); deploy-guard + dev-warning helper unit tests (wrangler); `wrangler compile` e2e (supported → bundle/files; unsupported → error; `--force`; `--serve` runs the bundle under bare `workerd` and serves dynamic + static + 404); extension-pruning + read-only-disk unit tests (miniflare). _(Done.)_ Remaining: binary-format coverage once it lands.
- [x] **Pruning/cleanup** of the rough edges above (module-path leak, unused extensions, read-only assets disk). Remaining: assemble-only path (avoid briefly starting `workerd`).
- [x] **`--serve`** — run the emitted bundle locally with the bundled `workerd` binary (the exact production artifact). _(Done; §6 / §8.6.)_
- [x] **`--format binary`** — emit a single self-contained `config.bin` (encoded Cap'n Proto, run with `workerd serve --binary`) instead of text + `src/` embeds. _(Done; §6 / §8.)_
- [x] **README.md** in the emitted bundle (per-platform run instructions: local, Docker, PaaS `$PORT`). _(Done.)_ `COMPILE_REPORT.md` keeps the capability detail (services kept/stripped, pruned extensions, warnings).
- [x] **`@cloudflare/vite-plugin` `standalone` mode** — thin adapter onto the same core via `unstable_compileStandalone()` (§7, §17). _(Done.)_
- [x] **Workerd version pinning** in the Dockerfile/README/report — pinned to the exact `workerd` version this Wrangler build bundles. _(Done.)_
- [ ] **Vite multi-worker / auxiliary Workers** — `standalone` currently compiles only the entry Worker (warns otherwise). _(Tied to cross-bundle service bindings, §8.5.)_
- [ ] **Assemble-only path** (optimization) — `compile` briefly starts `workerd` via Miniflare just to read the assembled config.

### ⬜ Left to do — gated / later phases

- [ ] **Phase 2 — Durable Objects on cluster mode** (gated on a workerd release with #6780). The public-unlock. _(Not started.)_
- [ ] **Stateful simulators** (KV/R2/D1/maybe Queues) — only with a real prod story; **external bindings** are the leading alternative (§11, O11). _(Punted.)_
- [ ] **FU-1 — Remote-backed bindings** (AI/Browser/Vectorize/… via live Cloudflare) (§8.3). _(Deferred.)_
- [ ] **Cross-bundle service bindings** (§8.5), **`--format executable`**, per-platform deploy recipes. _(Deferred.)_

### ❓ Open decisions needing your call

- **O11** — stateful prod story route: hardened simulators vs. external bring-your-own bindings (lean: external-first). See §11 / §13.

> ## Release posture (read first)
>
> - **Public release is GATED on cloudflare/workerd#6780 landing.** #6780 (cluster mode for Durable Objects) is what gives the unique Cloudflare primitive — Durable Objects — a real production story. Until it lands, this is **alpha and internal only**.
> - **We will not ship any feature publicly that lacks a great production story.** This explicitly includes the stateful simulators (KV, R2, D1, **and Queues — which we may not do at all**). They are _punted_, not scheduled, until a credible prod story exists (see §11 + the data caveats). #6780 fixes the worst state hazard but is **not sufficient** on its own for KV/R2/Queues (it doesn't address on-disk format stability, queue persistence, or backups).
> - **Alpha = wiggle room.** While alpha, nothing is stable: the output layout, `config.capnp` shape, CLI flags, and runtime behavior may all change without notice. No backward-compatibility guarantees until we declare GA. GA criteria: #6780 landed + a great prod story for every shipped feature.

---

## 1. Motivation

`workerd` has always been runnable in production to self-host Workers outside of Cloudflare (AWS, Hetzner, Railway, Render, Fly, bare metal, etc.). In practice almost nobody does, because:

1. You must hand-author a Cap'n Proto (`.capnp`) config — there is no supported tool that turns a `wrangler.jsonc` + bundled Worker into a runnable workerd config.
2. Features people expect "for free" on Cloudflare (static assets routing with `_headers`/`_redirects`/SPA handling, KV/R2/D1, Durable Objects) are not wired up by a bare `workerd serve`.

Meanwhile, **Miniflare already solves the hard half of this**: it converts Worker options into a real `Workerd.Config` and runs it, and its KV/R2/D1/Queues/Cache "simulators" are themselves pure workerd Workers backed by SQLite — not Node code. The Node.js process is only needed for **dev-only scaffolding** (pretty errors, custom JS service bindings, magic proxy, inspector, live reload).

`wrangler compile` makes the existing-but-hidden capability into a product: take a Worker, emit a self-contained directory that runs anywhere `workerd` runs, with a curated set of features wired up out of the box. PR cloudflare/workerd#6780 (cluster mode for Durable Objects) is the future unlock that makes the output horizontally scalable; this RFC keeps clustering out of the MVP but designs so it can slot in.

## 2. Goals

- `wrangler compile --outdir <dir>` produces a **portable, Node-free** bundle that runs via `workerd serve config.capnp`.
- MVP supports **stateless Workers + static assets** with production-equivalent asset behavior (`_headers`, `_redirects`, `html_handling`, `not_found_handling`, `run_worker_first`).
- Output includes a **Dockerfile** (`FROM` a pinned `workerd` image) and a **capability report** explaining which bindings are wired, simulated, or unsupported.
- Secrets map to **environment variables** (`fromEnvironment`), never baked into the bundle.
- A `@cloudflare/vite-plugin` `standalone` mode produces the same bundle from `vite build`, reusing the same core.
- Deterministic, inspectable output: emit **text** `.capnp` (human-readable, diffable, editable), not just binary.

## 3. Non-goals (MVP)

- **Full Workers _platform_ parity.** We target the _runtime_ (workerd), not the platform. Things provided by Cloudflare's edge — `request.cf`, smart placement, the cron scheduler, the queues/email pumps, the tail/observability dashboard, global replication — are out of scope and **documented loudly**. This is an accepted, explicit limitation, not a bug.
- **Stateful simulators (KV/R2/D1/Queues) — punted, not scheduled.** They will not ship publicly without a great prod story (which #6780 alone does not provide). Queues may never ship. See §11 + data caveats. The architecture leaves room to add them, but there is no committed timeline.
- **Durable Objects — gated on #6780.** DOs are the headline post-#6780 capability (they get a real distributed prod story), but they are not in the pre-#6780 alpha.
- Cron triggers, Browser Rendering, Email, Dispatch, Secrets Store, Pipelines — out of scope (report as unsupported).
- Custom programmatic `serviceBindings: () => {...}` JS callbacks — fundamentally Node-bound; unsupported in compiled output by design.
- **Cross-bundle service bindings** (binding to a _separately-deployed_ Worker by name) — punted for now; see §8.5. The decision (compile multiple workers into one bundle vs. treat as external/remote vs. unsupported) is deferred.
- **Python workers** (`python_workers`) — would require shipping the Pyodide runtime into the bundle; out of scope, reported unsupported.
- Single-file `workerd compile` executable output — later `--format executable`.

## 4. Background: what already exists (reuse map)

| Need                                | Reuse from                                    | Path                                                                                       |
| ----------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Read + normalize config             | `readConfig` / `normalizeAndValidateConfig`   | `packages/wrangler/src/config/index.ts`, `packages/workers-utils/src/config/validation.ts` |
| Bundle Worker → modules             | `buildWorker()` → `CfModule[]`                | `packages/wrangler/src/deployment-bundle/maybe-build-worker.ts`                            |
| Asset manifest (paths + hashes)     | `buildAssetManifest()`                        | `packages/deploy-helpers/src/deploy/helpers/assets.ts`                                     |
| Asset router/asset config           | `getAssetsOptions()`                          | `packages/wrangler/src/assets.ts`                                                          |
| Config → Miniflare worker options   | `unstable_getMiniflareWorkerOptions()`        | `packages/wrangler/src/api/integrations/platform/index.ts`                                 |
| Build `Workerd.Config` from options | Miniflare plugin pipeline (`#assembleConfig`) | `packages/miniflare/src/index.ts`                                                          |
| Serialize config (binary)           | `serializeConfig()`                           | `packages/miniflare/src/runtime/config/index.ts`                                           |
| Config JS type definitions          | `Config`, `Service`, `Worker`, `Socket`, ...  | `packages/miniflare/src/runtime/config/workerd.ts`                                         |
| Assets workers (router/asset)       | `@cloudflare/workers-shared`                  | `packages/workers-shared/{asset-worker,router-worker}`                                     |
| CLI command scaffolding             | `createCommand` + `CommandRegistry`           | `packages/wrangler/src/core/*`, e.g. `agent-memory/`                                       |

Key facts established during research:

- Miniflare always runs workerd with `serve --binary --experimental ... -` (config on **stdin**, binary capnp) and depends on a Node **loopback** external service (`core:loopback`) plus an **entry worker** that does request routing + pretty-error conversion. These are the dev-only pieces to strip.
- The simulator Workers (KV/R2/D1/Queues/Cache) persist to a `disk` service + SQLite and do **not** require the Node loopback at runtime.
- workerd's `kvNamespace`/`r2Bucket`/`queue`/`analyticsEngine` bindings are **HTTP redirects to a named service** — workerd ships no storage backend; the simulators provide it.
- `MINIFLARE_WORKERD_CONFIG_DEBUG=<path>` dumps the assembled JS `Config` as JSON — the prototyping hook.
- There is **no** existing text-`.capnp` exporter anywhere; Miniflare only emits binary on stdin.

## 5. Architecture: the shared core

Introduce a new module that produces a **production profile** of the workerd config — i.e. the same plugin-derived services/bindings, but assembled for "ship it" rather than "dev it."

> **As-built note:** the original layout/names below were the proposal. What actually landed (see §15–§17 for detail):
>
> ```
> packages/miniflare/src/standalone/
>   capnp-text.ts                 # emitConfigText(config, sink) — text .capnp serializer
>   transform.ts                  # toStandaloneConfig(config) — production-profile transform (reachability-pruned)
>   emit.ts                       # emitStandaloneBundle(config, outDir) — config.capnp + embeds + disk copies
>   index.ts                      # public exports
>
> packages/wrangler/src/compile/
>   index.ts                      # `wrangler compile` command + runStandaloneCompile() + unstable_compileStandalone()
> packages/wrangler/src/standalone/
>   validate.ts                   # getStandaloneBindingIssues() / formatStandaloneBindingIssues()
>
> packages/vite-plugin-cloudflare/src/plugins/standalone.ts
>                                 # buildApp post-hook → wrangler.unstable_compileStandalone()
> ```
>
> Differences from the proposal: there is **no separate `assembleStandaloneConfig`** — `wrangler compile` drives a real Miniflare instance and reads the assembled graph via `unstable_getConfig()`, then `toStandaloneConfig()` does the production transform. The Vite path hooks `buildApp` (not `closeBundle`/`writeBundle`).

### 5.1 Production-profile config assembler

Rather than fork `#assembleConfig`, factor out a reusable assembler that consumes the **same plugin `getServices()` / `getBindings()` output** but builds a leaner top-level `Config`:

- **Omit**: `core:loopback` external service, the dev `entry` worker (pretty errors / live reload / magic proxy), inspector/debug-port sockets, dev-registry proxy, local explorer.
- **Sockets**: emit a single `http` (or `https`) socket pointed **directly** at the user worker service — or, when assets are present, at the **assets router worker** which then falls through to the user worker (matching production precedence and `run_worker_first`).
- **Paths**: rewrite all `disk` service paths to be **relative** to the bundle root (e.g. `./assets`, `./state/kv`), resolvable at boot via workerd `--directory-path <name>=<abs>` overrides or a documented working directory.
- **Secrets**: convert secret-class bindings to `fromEnvironment` so they read `getenv()` at startup.
- **Determinism**: stable service ordering and names; no temp dirs.

Practically this is a thin alternate top-level assembler that imports the plugin registry and calls each plugin's `getServices`/`getBindings` (the per-binding logic is reused verbatim), then stitches a production top-level instead of the dev one. The MVP only needs the `core` and `assets` plugins, so the first cut can be small and grow as Phase 2 adds storage plugins.

### 5.2 Text capnp emitter

Miniflare's `Config` JS type (`runtime/config/workerd.ts`) is a faithful mirror of `workerd.capnp`. `emitCapnpText.ts` walks that object and prints valid text capnp:

```capnp
using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [ ... ],
  sockets  = [ ( name = "http", address = "*:8080", http = (), service = "router" ) ],
);
```

Modules are referenced via `embed "worker/index.js"` rather than inlined, so the `.capnp` stays readable and the JS lives as real files in the bundle. Binary blobs (asset manifest, wasm) are emitted as files and `embed`-ed. We keep `serializeConfig()` (binary) available behind `--format binary` for size-sensitive cases.

> Open question O1: emit text capnp (readable, editable, what this RFC recommends) vs binary capnp via existing `serializeConfig` (smaller, opaque). Recommendation: text by default, binary opt-in.

### 5.3 Static assets wiring

Reuse Miniflare's assets plugin output (it already emits pure workers):

- `assets:storage` → `disk` service at `./assets`
- asset manifest (binary) → `data` binding (built via `buildAssetManifest`, but using the **content-hash-of-bytes** manifest, not the dev mtime shortcut)
- `@cloudflare/workers-shared` `asset-worker` + `router-worker` as `esModule` services
- `CONFIG` JSON from `getAssetsOptions()` (`html_handling`, `not_found_handling`, redirects, headers, `run_worker_first`)
- Socket → router worker → (assets | user worker) per `routerConfig`

This gives production-equivalent asset semantics with no bespoke MIME/SPA code.

## 6. CLI surface

> **Status:** the command has landed with a deliberately small surface. **Implemented today:** `--outdir` (default `./dist-standalone`), `--force`, `--format text|binary`, and `--serve` (+ `--port` / `--ip`). The remaining flags below are the **target** surface, not yet built.

```
# Implemented:
wrangler compile [--outdir <dir>] [--force] [--format text|binary]
                 [--serve [--port <n>] [--ip <addr>]]

# Target (planned, not yet built):
wrangler compile [--assets <dir>] [--compatibility-date ...] [--env <name>]
                 [--experimental] [--strict] [--dry-run]
```

- **`--outdir`** (implemented): output directory, default `./dist-standalone`.
- **`--force`** (implemented): compile even when the Worker uses bindings not yet supported by standalone workerd (otherwise unsupported bindings are a hard error; see §16).
- **`--format`** (implemented): `text` (default) emits a human-readable `config.capnp` plus `src/` module/blob embeds; `binary` emits a single self-contained `config.bin` (encoded Cap'n Proto with modules inlined) run via `workerd serve --binary`. The entrypoint/Dockerfile/README/report adapt automatically. (The earlier `dir|capnp|binary` sketch collapsed to `text|binary` — "dir" is just the always-present output directory.)
- **`--serve`** (implemented): after compiling, run the produced bundle locally via the bundled `workerd` binary — exercises the **exact production artifact** on localhost. `--port` (default `8080`) and `--ip` (default `127.0.0.1`) control the bind address. Polls the socket for readiness, prints a `Serving …` line, and forwards `SIGINT`/`SIGTERM` to `workerd`. See §8.6.
- _(planned)_ `--assets` overrides/forces the assets directory (otherwise read from config `assets.directory`).
- _(planned)_ `--experimental` (default **off**): include workerd's `--experimental` flag in the generated entrypoint. Off by default for production safety; required to opt into experimental runtime features (ephemeral DO, memory cache, later `localDisk`/cluster). See §8.4.
- _(planned)_ `--strict` (default off): escalate "no-op handler" and unsupported-binding warnings to hard errors (good for CI). Note: unsupported-binding handling already errors-by-default + `--force` to bypass, which is the inverse of the original `--strict` proposal; revisit whether `--strict` is still needed.
- Reuses `createCommand` + `registry.define([{ command: "wrangler compile", definition }])` + `registerNamespace`, mirroring `agent-memory` and the hidden `build` command. Status `experimental`.
- Handler receives normalized `config` from `createHandler` (default `provideConfig`).

## 7. Vite plugin surface

> **As-built:** `cloudflare({ standalone: true | { outDir?, force? } })` (landed — see §17). The original `{ outdir, format, port }` shape was trimmed to `{ outDir, force }` to match the CLI; `format`/`port` follow once the CLI gains them.

`@cloudflare/vite-plugin` gains `standalone: true | { outDir?, force? }`. On `vite build` it already has the worker module graph + client assets; after the build is finalized (deploy config + per-Worker `wrangler.json` written) a `buildApp` post-hook reads the entry Worker's generated `wrangler.json` and calls the **same core** via `wrangler.unstable_compileStandalone()`. No duplicate logic — the Vite path is a thin adapter pointing the shared orchestration at the Vite-generated config. (Vite 6 vs 7/8 timing is handled by a guarded wrapper; exactly one path fires per build.)

## 8. Output layout

The proposed/target layout:

```
dist-standalone/
  config.capnp          # text capnp; entry point for `workerd serve`
  worker/
    index.js            # bundled user worker (+ additional modules: wasm, etc.)
  assets/               # static files, copied from assets.directory
  assets-manifest.bin   # binary asset manifest (embed-ed by config)
  state/                # reserved for Phase 2 stateful bindings (empty in MVP)
  Dockerfile
  COMPILE_REPORT.md     # capability report (wired / simulated / unsupported)
  README.md             # how to run locally + on each platform
```

> **As-built (current):** in the default `text` format the emitter writes embeds under `src/` and copies `disk` services under `disk/<sanitized-service-name>/`, so a real bundle looks like:
>
> ```
> dist-standalone/
>   config.capnp                  # text capnp (text format)
>   src/                          # embedded modules + data blobs (ASSETS_MANIFEST, asset-worker.mjs, …)
>     index.js                    # user worker (emitted relative to the common module root, no temp-path leak)
>   disk/assets_storage/          # copied static assets (index.html, …)
>   Dockerfile                    # pins `workerd@<version>` this bundle was built against
>   entrypoint.sh                 # $PORT-aware `workerd serve` wrapper
>   README.md                     # how to run: local / npx / Docker / PaaS $PORT
>   COMPILE_REPORT.md             # capability detail (kept/stripped services, pruned extensions, warnings)
> ```
>
> With `--format binary` the `config.capnp` + `src/` embeds collapse to a single self-contained `config.bin` (modules inlined); only `disk/` plus the runtime/doc files sit alongside it, and `entrypoint.sh`/`README`/`Dockerfile` use `workerd serve --binary config.bin`.
>
> Not yet emitted: a `state/` dir (Phase 2) and the tidier `worker/`+`assets/` naming. These are tracked in §0 / §16.

### 8.1 Dockerfile + entrypoint (MVP)

Platforms (Railway, Render, Fly, Heroku-style, some ECS setups) inject a dynamic `$PORT` at runtime. workerd does not read env into socket addresses, so we ship a tiny entrypoint wrapper rather than a static `--socket-addr`:

```sh
# entrypoint.sh
exec workerd serve config.capnp \
  --socket-addr=http=0.0.0.0:"${PORT:-8080}" \
  ${WORKERD_EXTRA_ARGS:-}
```

```dockerfile
FROM <pinned-workerd-image-or-base-with-workerd-binary>
WORKDIR /worker
COPY . .
EXPOSE 8080
ENTRYPOINT ["./entrypoint.sh"]
```

The socket in `config.capnp` is named `http` so the entrypoint's `--socket-addr=http=...` override binds it. `--experimental` is only added to `WORKERD_EXTRA_ARGS`/entrypoint when `--experimental` was passed at compile time.

> Open question O2: which workerd distribution to base on (official published image vs `npm i workerd` binary copied into a slim base). **Verify whether an official `workerd` container image is published** (uncertain) — if not, we copy the pinned `workerd` npm binary into a Debian/distroless base. Pin to the same version the config was generated against to avoid schema/feature drift.

### 8.2 Capability report

Generated per compile run, classifying every binding found in config:

- **Wired** (Tier 1): runs natively (routing, fetch, service bindings, assets, env secrets).
- **Simulated** (Tier 2, Phase 2): shipped simulator + disk state (KV/R2/D1/Queues/Cache/DO).
- **External** (Tier 3): needs you to provide infra (Hyperdrive → your DB, `service`/`external` targets).
- **Remote-backed** (Tier 3b, _future_): proxied to live Cloudflare via remote bindings when `--account-id` + token are provided (Browser Rendering, AI, Vectorize, Images, Email, Dispatch, Secrets Store, Pipelines; optionally KV/R2/D1/Queues). Deferred follow-up — see §8.3 / §11.
- **Unsupported** (Tier 4): anything not in the above and not remote-capable (e.g. cron triggers) — emit a clear warning and skip.

In MVP, encountering Tier 2/3/4 bindings produces a warning (and, with `--strict`, an error).

## 8.3 Remote-backed bindings (Cloudflare-as-a-service) — FOLLOW-UP (deferred)

> Status: **deferred follow-up, not in MVP.** Captured here for design completeness; to be investigated and implemented in a later phase (see §11). The MVP ships nothing here — remote-only bindings are reported as unsupported until this lands.

For products with no local backend (Browser Rendering, AI, Vectorize, Images, Email, Dispatch, Secrets Store, Pipelines) — and optionally for KV/R2/D1/Queues when the user wants the _real_ Cloudflare resource — the bundle can proxy to live Cloudflare services using the existing **remote bindings** (mixed-mode) machinery. This is opt-in via an account ID + API token at compile time.

### How it reuses existing infrastructure

workers-sdk already implements this for `wrangler dev`:

- **Setup (Node, needs auth):** `startRemoteProxySession` (`packages/wrangler/src/api/remoteBindings/start-remote-proxy-session.ts`) deploys a `ProxyServerWorker` to the user's account (auth via `getAuthHook` → `requireAuth` + `requireApiToken`), carrying the real bindings, and returns a `remoteProxyConnectionString` (a `workers.dev` URL).
- **Runtime (pure workerd, no Node):** `packages/miniflare/src/workers/shared/remote-proxy-client.worker.ts` proxies each `env.X` call to that URL — `fetch()` with `MF-Binding`/`MF-Header-*` headers, or a `capnweb` WebSocket RPC session for JSRPC-style bindings (`remote-bindings-utils.ts`).

The client worker is the key enabler: it needs only `fetch` + WebSocket, both native to workerd. **Node is involved only at setup/deploy time, never at request time** — so it slots directly into a compiled bundle.

### Compile-time flow

1. With `--account-id <id>` + `CLOUDFLARE_API_TOKEN`, classify which bindings are remote (`pickRemoteBindings` + `getBindingLocalSupport`; some products report `DO-NOT-USE-...-never-have-a-local-simulator` and are remote-only).
2. Deploy a **persistent, named** proxy worker (NOT the ephemeral dev preview) with those bindings + an auth secret.
3. Bake the `remoteProxyConnectionString` + the remote-proxy-client worker into the bundle; pass the auth secret via `fromEnvironment`.
4. At runtime under `workerd serve`, `env.AI` / `env.BROWSER` / `env.VECTORIZE` / etc. transparently proxy to live Cloudflare.

This promotes Tier-4 "unsupported" bindings to **Tier 3b — remote-backed** (works out of the box when an account + token are supplied). Reflected in the capability report.

### Deltas vs. the dev path (the actual new work)

- **Lifecycle:** dev deploys an ephemeral _preview_ worker (`dev.remote: "minimal"`) with temporary edge-preview tokens; self-host needs a long-lived deployed worker (or reuse of a pinned one). Compile owns this deployment rather than calling `startRemoteProxySession` directly.
- **Security:** the connection string invokes account bindings, so the persistent proxy MUST be authenticated — shared-secret header or Cloudflare Access service token (`CLOUDFLARE_ACCESS_CLIENT_ID`/`_SECRET` hooks already exist in `remote-bindings-utils.ts`). Generate the secret at compile time; never hardcode it.
- **Cost/latency/egress:** every call round-trips to Cloudflare and is billed; surface this in the report. Inherent for AI/BR/Vectorize (no local equivalent).

### Why a proxy worker at all (vs. direct REST)

These products _do_ have public HTTP APIs, but in a Worker they're consumed as `env.X.method(...)`, not `fetch(api.cloudflare.com)`. The `env.X` object is a **wrapped binding** backed by a workerd-internal shim (e.g. `cloudflare-internal:ai-api`, see `packages/miniflare/src/plugins/ai/index.ts`) that wraps an inner `fetcher` and emits Cloudflare's **internal binding protocol** — _not_ the public REST shape. The proxy worker holds the real binding and is the uniform, binding-agnostic terminator of that internal protocol. That's why dev uses it: one mechanism, zero per-product code, faithful for everything.

### Two tracks for compile

- **Track A — direct REST (no proxy), REST-capable products:** AI, Vectorize, D1, KV, R2/S3, Images, Queues. Point the inner fetcher at `api.cloudflare.com` (or the S3 endpoint) + Bearer token, and ship a **REST-shaped shim per product** that maps `env.X.method()` → the public endpoint. Pros: no deployed proxy, lower latency. Cons: we own/maintain a REST adapter per product (drift risk).
- **Track B — proxy worker (faithful), binding-protocol-only:** service bindings (`fetch`/JSRPC), Durable Object namespaces across the boundary, dispatch namespaces (`env.DISPATCHER.get().fetch()`), Browser Rendering full Puppeteer/CDP control, and anything using capnweb streaming. These have no public request/response REST equivalent, so the deployed proxy (real binding in its `env`) is the only faithful option — or mark unsupported.

The `getBindingLocalSupport` table (`packages/workers-utils/src/config/binding-local-support.ts`) is the source of truth for which bindings are remote-only (`DO-NOT-USE-...-never-have-a-local-simulator`: ai, ai_search, media, vpc_service, vpc_network, websearch, agent_memory; `dispatch_namespace: remote`).

> Open question O6: do we deploy the persistent proxy worker on the user's behalf during `compile` (needs write API token + cleanup story), or only emit instructions + config and let the user deploy it? Recommendation: support both — `--deploy-proxy` to do it, otherwise emit a ready-to-deploy proxy project + wiring.
> Open question O7: how far to invest in Track A REST shims (which products, and do we reuse any existing adapters) vs. defaulting everything to Track B proxy. Recommendation: start Track B (universal, low-code), add Track A shims opportunistically for the highest-traffic REST products (AI, Vectorize) to cut latency/egress.

## 8.4 Runtime & operational behavior

- **`--experimental` is OFF by default.** Production bundles run without it for safety; opt in via the compile `--experimental` flag. Document which features require it.
- **Dynamic port** via the entrypoint wrapper (`$PORT`, default 8080); see §8.1.
- **Minimal `request.cf`.** Bare workerd populates `request.cf` with only `{ clientIp }` (verified in the spike) — not the full geo/colo/TLS object Cloudflare provides. So `request.cf` is _defined_ but `request.cf.country` etc. are `undefined`. **Documented loudly**; a future `--cf-blob <json>` static override is possible. Part of the accepted "runtime, not platform" stance (§3).
- **No-op handlers.** A worker exporting `scheduled()` (cron), `queue()`, `email()`, or DO `alarm()` handlers will compile, but **nothing drives them** in bare workerd. Compile detects these and **warns by default; errors under `--strict`**. (Deliberate: warn is the default so a worker whose primary `fetch()` handler is fine still compiles, but CI can opt into failing.)
- **Error visibility is reduced vs `wrangler dev`.** The Node loopback pretty-error layer is stripped, so unhandled exceptions surface as a plain 500 + a stack on stderr. MVP ships a **minimal in-worker last-resort error handler** and emits **structured logs to stdout**. The report sets expectations: no dashboard/tail; bring your own log aggregation.
- **Static asset size:** **no 25 MiB per-asset cap.** Assets are served straight from disk (with a CDN expected in front for production), so Cloudflare's asset-size limit does not apply.
- **Health checks:** a TCP check on the port suffices; consider a built-in `/cdn-cgi/healthz` endpoint (O8).
- **SIGTERM / graceful shutdown (rumination, verify):** Cloudflare exposes no lifecycle hook to Worker _code_ (the platform drains), so we will **not** invent one (breaks parity). But the _process_ receives SIGTERM from `docker stop`/k8s rollouts/PaaS redeploys. The runtime should stop accepting connections, drain in-flight requests, and (Phase 2) flush DO/SQLite before exit. **Action: verify whether workerd already drains+flushes on SIGTERM or hard-exits** (empirical / ask workerd team). Low-risk for stateless+assets (LB retries); matters for Phase 2 state.

## 8.5 Cross-bundle service bindings (punted)

If the worker binds `env.OTHER` to a _separately-deployed_ Worker, self-host has nowhere to route it. The resolution — (a) compile multiple workers into one bundle and wire them locally via `service` bindings, (b) treat as external/remote (FU-1), or (c) mark unsupported — is **deferred**. MVP assumes a single user worker (+ optional assets). Multi-worker bundles and the "which worker is the entrypoint" question are noted but not designed yet. Assets-only projects (no `main`) _are_ in scope: socket → router → assets, no user worker.

## 8.6 Local dev & parity

- **The inner dev loop is unchanged.** Developers keep using `wrangler dev` / Vite dev. `wrangler compile` is a **release/packaging step**, not a dev mode — it does not replace `dev`.
- **Test the artifact locally before shipping.** There is a real behavioral gap between `wrangler dev` (loopback, pretty errors, hot reload, inspector, mock `cf`) and the compiled bundle (none of those). To catch bugs that hide in that gap, `wrangler compile --serve` compiles and runs the **exact production artifact** locally via the bundled `workerd` binary on localhost. **Landed** (§6): launches `workerd serve config.capnp` from the bundle root, binds `--ip`/`--port`, waits for the socket to accept requests, and tears down cleanly on `SIGINT`/`SIGTERM`. Covered by `packages/wrangler/e2e/compile.test.ts` (fetches a dynamic route, a static asset, and a 404 against the running bundle).
- **Dev↔compiled parity is the core promise and the core risk.** "What you `dev` is what you `compile`" only holds if we test it behaviorally (see §10). Known, documented divergences: no pretty errors, no `request.cf`, no inspector, reduced observability.

## 9. Security & correctness notes

- Never serialize secret values into `config.capnp`; use `fromEnvironment`. Document that `.dev.vars`/`.env` are dev-only.
- `internet` network service inherits Miniflare's allow-list; for production self-host, default to `public` only (no `private`/SSRF surface) unless the user opts in.
- Inbound TLS: support `--tls-key`/`--tls-cert` → `TlsOptions` keypair, but default to plain HTTP behind a platform LB (Railway/Render/Fly terminate TLS).
- Pin workerd version into the bundle metadata; warn if the local `workerd serve` version differs from the one compiled against (capnp schema is wire-compatible but features/flags drift).

## 10. Testing strategy

**Landed:**

- **Miniflare core (unit + e2e):** reachability/repoint/relativize transform, read-only assets disk, extension pruning (incl. transitive keep + `pruneExtensions: false`), emitted text + file layout, **and end-to-end tests that run the emitted bundle under the real `workerd serve` binary in both `text` and `binary` formats** and assert a `200` + the worker's JSON (incl. a `fromEnvironment` value). `packages/miniflare/test/standalone.spec.ts`.
- **workers-utils (unit):** `getStandaloneSupport` supported/unsupported matrix + unknown-binding default; `standalone` config field validation (boolean accepted, non-boolean errors).
- **wrangler `compile` (e2e):** fixture worker + `public/` dir → `wrangler compile` → assert `config.capnp` (vars baked), version-pinned `Dockerfile`, `entrypoint.sh`, `README.md`, `COMPILE_REPORT.md`, and the copied `disk/assets_storage/index.html`; unsupported binding (KV) → error; `--force` → compiles; **`--serve` runs the emitted bundle under the real `workerd` binary and serves a dynamic route, a static asset, and a 404**; **`--format binary --serve` does the same from a single `config.bin`** (served-behavior coverage). `packages/wrangler/e2e/compile.test.ts`.
- **wrangler guards (unit):** deploy errors when `standalone` set / allows `--dry-run`; `getStandaloneBindingIssues`/`formatStandaloneBindingIssues` helpers. `packages/wrangler/src/__tests__/standalone.test.ts`.
- **Vite (integration):** programmatic `createBuilder().buildApp()` with `cloudflare({ standalone: true })` emits the standalone bundle; disabled by default; plus `standalone` option resolution. `packages/vite-plugin-cloudflare/src/__tests__/{standalone-build,resolve-plugin-config}.spec.ts`.

**Still to add (tied to unbuilt features):**

- **Deeper asset-behavior coverage:** the `--serve` e2e now covers dynamic route + static asset + 404; still to add explicit `_headers`/`_redirects` and `run_worker_first` precedence assertions against the running bundle.
- **Vite↔CLI behavioral parity:** run both bundles and assert equivalent responses (not byte-identical capnp).
- **Dev↔compiled parity:** same fixture under `wrangler dev` vs the compiled artifact via `--serve` (now possible); codify known divergences (no `request.cf`, no pretty errors) as explicit expectations.
- Conventions: `runInTempDir`, `mockConsoleMethods`, `expect` from test context. Changeset required (user-facing) — landed.

## 11. Phasing

All of Phase 0–1 is **alpha / internal**. Nothing goes public until #6780 lands AND every shipped feature has a great prod story (see Release posture).

- **Phase 0 — spike: ✅ DONE (validated).** See §14. A real stateless+assets config was dumped via `MINIFLARE_WORKERD_CONFIG_DEBUG`, stripped of the dev scaffolding, emitted as text capnp, and served correctly under bare `workerd serve` (worker + assets + content-types + 404, no Node, no `--experimental`). The production-profile approach is confirmed feasible.
- **Phase 1 — alpha (this RFC, internal): ✅ CORE IMPLEMENTED, polish remaining.** `wrangler compile` **and Vite `standalone` mode** for **stateless + static assets** → dir + Dockerfile + report; text capnp; shared `standalone` core in Miniflare; shared `unstable_compileStandalone()` orchestration; `standalone` config + `dev` warning + `deploy` guard. text **and binary** capnp; pinned-`workerd` Dockerfile + bundle `README.md`. Verified end-to-end under bare `workerd` via both entry points. Remaining: an assemble-only path (avoid briefly starting `workerd`) and Vite auxiliary Workers. See §0 / §15 / §16 / §17. Not public.
- **Phase 2 — Durable Objects on cluster mode (the public-unlock):** gated on a workerd release including #6780. `--cluster` emits `ClusterConfig` + shared channel-token key + sample multi-node compose/k8s; horizontally scalable DOs on shared FS/NFS. This is the capability that justifies a public alpha/beta, because DOs are the unique primitive and #6780 gives them a real prod story.
- **Conditional (prod-story-gated, no committed timeline) — stateful simulators:** KV/R2/D1/(maybe Queues)/Cache. Ship _only if_ we close the gaps #6780 leaves: on-disk format-stability commitment, backup/restore tooling, queue persistence, and a clear single-node-vs-clustered story. The likely-better alternative is `external` bindings (R2→S3/MinIO, D1→SQL gateway, KV→Redis) — see §11 posture. Queues may never ship.
- **Later — polish:** `--format executable` (`workerd compile`), per-platform deploy recipes (ECS/Fly/Hetzner/Railway/Render), Hyperdrive → external DB, state seeding/migration tooling.

### Follow-up items (deferred, post-MVP — investigate then implement)

- **FU-1 — Remote-backed bindings (Cloudflare-as-a-service):** wire AI / Browser Rendering / Vectorize / Images / Dispatch / etc. (and optionally KV/R2/D1/Queues) to live Cloudflare when an account ID + API token are provided. Full design in §8.3. Requires: persistent (non-preview) proxy worker lifecycle, proxy auth (shared secret / Access service token), and a decision on Track A (direct REST shims) vs Track B (proxy worker) per product (O6/O7). Until done, remote-only bindings are reported unsupported.

### Phase 2 caveat: the Miniflare simulators are NOT a managed database

Before defaulting Phase 2 to the shipped simulators, weigh these concerns (they shape the recommended posture — see O11):

1. **On-disk format is a Miniflare implementation detail, not a stable contract.** `migrateDatabase()` already exists for "legacy layout" → the format has changed before. Runtime upgrades can require migration or risk data loss. No committed backward-compat guarantee.
2. **Multi-process corruption (the hard one).** The simulators _are_ Durable Objects (single-owner per object per instance). Multiple workerd processes over the same `state/` dir = uncoordinated writers on the same SQLite files → corruption. This is #6780's problem, but the KV/R2/D1 simulators aren't covered, so **any stateful binding pins you to a single workerd process**. Silent, sharp edge when scaling out.
3. **Queues lose data on restart** (simulator uses `inMemory`, no disk persistence). Not production-grade; must be flagged.
4. **Semantics match, guarantees don't.** Local KV = strong+unreplicated (vs eventual+global); R2 = no multipart-scale/lifecycle; D1 = no backups/time-travel/replicas; no Cloudflare quotas. Portability footgun both ways.
5. **No backup/restore/observability** tooling; operator must back up `state/` (consistently — see #6).
6. **Crash consistency / torn backups.** SQLite WAL protects committed writes, but file-blob store + naive live copy can capture a torn snapshot. Needs a documented quiesce/checkpoint backup procedure.
7. **Throughput.** Built for dev fidelity, not load; single SQLite-backed DO per namespace bottlenecks under real traffic.

**Recommended Phase 2 posture:** lead with **"bring your own infra via `external` bindings"** (R2→S3/MinIO, D1→your SQL gateway, KV→Redis) as the _recommended_ production path; offer the simulators as a **zero-config, single-node, you-own-backups** default with loud caveats (good for small/hobby/rebuildable-data apps, not a managed DB).

### Prerequisites (before writing code) — mostly addressed during Phase 1

1. ✅ **Phase 0 spike** — done (§14).
2. ✅ **Loopback/entry-worker dependency audit** — done; the reachability transform drops `loopback`/`core:entry`/`strip-cf-connecting-ip`/`cache`/`email:disk`/`local-explorer`/`rpc-proxy` (§14, §15).
3. ⬜ **Cross-team alignment with workerd/Miniflare owners** — still open: (a) dev simulators as a _production_ substrate; (b) `--experimental` in production; (c) workerd Docker image + version policy; (d) SIGTERM drain/flush behavior; (e) #6780 timeline. (O12 notes the teams work closely; formalize when needed.)
4. ⬜ **Ownership of the shared core** (`packages/miniflare/src/standalone`) — code landed there; Miniflare maintainers to confirm the maintenance contract (§12).
5. ✅ **Integration seam validated** — `deploy --dry-run` bundle + `unstable_getMiniflareWorkerOptions` + `unstable_getConfig()` feed the emitter (§16).
6. ✅ **Blocking open questions** — O1 (text capnp), O2 (Docker base), O4 (naming = `compile`), `--experimental` default off, `$PORT` entrypoint — all resolved.
7. ✅ **MVP binding matrix + warning UX** — `standalone-support.ts` + dev warning + compile error (§16); stability stance settled (O10).

## 12. Risks

- **Production profile drift:** factoring a second top-level assembler risks divergence from Miniflare's dev assembler. Mitigation: share all per-binding plugin logic; only the top-level stitching differs; snapshot tests.
- **Loopback-coupled features:** any feature secretly relying on the Node loopback (some error paths, custom bindings) silently breaks. Mitigation: capability report + E2E that runs the real binary.
- **Schema/version skew:** generated config vs installed workerd. Mitigation: pin + warn.
- **Scope creep into Phase 2 infra:** keep MVP strictly stateless+assets; gate the rest behind explicit warnings.

## 13. Open questions

### Resolved (decisions taken)

- **`--experimental`:** OFF by default, opt-in flag. ✓
- **`request.cf` / platform parity:** not provided; documented loudly; "runtime, not platform" is an accepted stance. ✓
- **No-op handlers:** warn by default, error under `--strict`. ✓
- **Asset size cap:** none (disk-served, CDN in prod). ✓
- **Cross-bundle service bindings:** punted (§8.5). ✓
- **Python workers:** out of scope, noted. ✓
- **O1 — text vs binary capnp default:** text by default, `--format binary` opt-in. ✓

### Still open — recommendations I can make

- **O2 — RESOLVED:** there is **no** official Cloudflare-published `workerd` Docker image (verified: workerd ships only as npm prebuilt binaries; the repo's `Dockerfile.release` is build-only; community images like `jacoblincool/workerd` / `Selflare` exist but aren't official). Decision: **build our own minimal image** by copying the pinned `workerd` npm binary into a slim/distroless base, pinned to the generated-against version. (Prior art worth reviewing: `Selflare` self-hosts Workers with KV/D1/R2/DO/Cache.)
- **O3:** Vite `standalone` — bundle SSR + client into one config, or worker only? Recommend worker + client assets = one config.
- **O4:** Naming — `wrangler compile` vs `wrangler build --standalone`. Recommend dedicated `compile` (`build` is already a hidden dry-run alias).
- **O5:** `state/` location vs container writable volume (Phase 2). Recommend a `DATA_DIR` env + `--directory-path` override convention.
- **O8:** Built-in `/cdn-cgi/healthz` endpoint, or document TCP check only? Recommend a lightweight built-in health endpoint.

### Resolved by product direction

- **O9 — MVP usefulness: RESOLVED.** Thin stateless+assets MVP is fine because it's **alpha/internal**; public value comes from Durable Objects post-#6780, not from KV in Phase 1. KV/R2/Queues are punted.
- **O10 — Support/stability stance: RESOLVED.** Alpha, internal, no stability guarantees; public release gated on #6780 + great prod story per feature (see Release posture).

### Need YOUR call — still open

- **O11 — How to build the stateful prod story (when/if we do).** Two routes to a "great prod story" for KV/R2/D1: (a) **simulators** hardened with #6780 coordination + format-stability commitment + backups, or (b) **external bindings** (bring-your-own S3/Postgres/Redis) as the recommended production path. You've ruled out shipping them without a story; the remaining question is which route (or both). Lean: external-first.
- **O12 — RESOLVED.** workerd and Miniflare teams work closely together; ownership of the shared `standalone` core and the "dev simulators as production substrate" decision can be made jointly when the time comes. Not a blocker.

## 14. Phase 0 spike results (validated)

A stateless Worker (`fetch` handler + `vars`) with static assets (`assets.binding`) was run under `wrangler dev` with `MINIFLARE_WORKERD_CONFIG_DEBUG`, the dumped config was transformed into a stripped standalone **text-capnp** bundle, and served under the bare `workerd` binary (v1.20260518.1) — no Node, no loopback, no `--experimental`.

**Result: PASS.** `/api/*` → dynamic worker (with `env.GREETING`); `/` → `index.html`; `/style.css` → `200 text/css` (correct content-type via the real `asset-worker`); unknown path → `404` (real `not_found_handling`). Port was set via `--socket-addr=http=...`, validating the `$PORT` entrypoint approach.

### Confirmed service graph (stateless + assets)

KEEP (runs standalone): `core:user:<name>` (user worker), `assets:router:<name>` (workers-shared router), `assets:assets-service:<name>` (workers-shared asset-worker), `assets:kv:<name>` (disk-backed fake-KV), `assets:storage` (`disk` → assets dir), `internet` (network).

DROP (dev-only): `loopback` (the **only** Node dependency), `core:entry` (dev entry/pretty-errors — the only service that binds `loopback`), `strip-cf-connecting-ip:*`, `cache:*`, `email:disk`, `core:local-explorer*`, `assets:rpc-proxy:*`.

### Concrete transforms the production-profile assembler must do (learned from the spike)

1. **Socket → router.** Replace the single `entry` socket (→ `core:entry`) with an `http` socket pointed directly at `assets:router:<name>` (or directly at the user worker when no assets). Name it `http` so the entrypoint's `--socket-addr=http=...` override binds.
2. **Repoint `globalOutbound`.** The user worker's `globalOutbound` points at the dev `strip-cf-connecting-ip:*` shim → repoint to `internet` (or omit to default).
3. **Relativize `disk` paths.** `assets:storage.disk.path` (and Phase 2 state dirs) → bundle-relative (`./public`, `./state/...`).
4. **Per-worker compat is preserved verbatim** from the plugin output (e.g. asset-worker = `2024-07-31` + `nodejs_compat`,`enable_ctx_exports`; router adds `no_nodejs_compat_v2`). Do not normalize.
5. **Extensions:** `toStandaloneConfig` keeps only the extension modules referenced by a kept worker — directly (the module name appears in a worker's source or a `wrapped` binding's `moduleName`) or transitively (imported by another kept extension module). For a stateless+assets worker this collapses to just `miniflare:shared` (+ `miniflare:zod` when used); the unused simulator extensions (ratelimit/workflows/email/analytics/dispatch) are pruned.
6. **`data`/`json` bindings** (e.g. `ASSETS_MANIFEST` binary, `ASSETS_REVERSE_MAP` json, `CONFIG`) carry over directly; emit binary `data` as `embed`-ed files in text mode.

### Caveats found

- **`request.cf` = `{ clientIp }` only** (not absent) — see §8.4.
- The debug JSON encodes `data` (Uint8Array) as a numeric-keyed object; a real emitter using Miniflare's `serializeConfig` keeps it as bytes (no round-trip concern there) — relevant only if a tool consumes the debug JSON directly.

### Spike artifacts

Throwaway, outside the repos: `/Users/sunilpai/code/compile-spike/` (`app/` = the dev project, `make-standalone.mjs` = the strip+emit prototype, `out/` = the runnable standalone bundle).

## 15. Phase 1 progress — standalone core landed (in `packages/miniflare`)

The production-profile assembler + text emitter (generalizing the spike's `make-standalone.mjs`) now live in the Miniflare package as a reusable, tested module: `packages/miniflare/src/standalone/`.

- **`capnp-text.ts` — `emitConfigText(config, sink)`**: a faithful text Cap'n Proto emitter for Miniflare's `Config` type. Inlines short scalars/strings/JSON (with a Cap'n-Proto-safe escaper that never relies on `\u`); externalizes module sources and binary blobs via an `EmbedSink` and references them with `embed`, keeping the config human-readable. Fails loud on unsupported shapes (Python modules, HTTPS sockets, crypto-key bindings) rather than emitting something wrong.
- **`transform.ts` — `toStandaloneConfig(config, options)`**: a pure transform. Instead of the spike's hardcoded keep-set, it does **reachability pruning** from the entry service (auto-detected: assets router → else first user worker), keeping only reachable, non-dev services. It repoints `globalOutbound` off the dev `strip-cf-connecting-ip` shim to `internet`, drops `cacheApiOutbound`/`moduleFallback` that reference dev-only services, replaces all sockets with a single named `http` socket → entry, and relativizes `disk` paths (returning `diskCopies` for the emitter). Input is not mutated; returns `{ config, diskCopies, keptServices, droppedServices, entryService, warnings }`.
- **`emit.ts` — `emitStandaloneBundle(config, outDir, options)`**: runs the transform and writes the config in the requested `format`. `"text"` (default) writes a human-readable `config.capnp` plus every embedded module/data file under `src/` (collision-safe); `"binary"` writes a single self-contained `config.bin` via `serializeConfig()` (modules inlined, no `src/`). Both copy each `disk` service's contents into the bundle. Returns `{ ..., configPath, files, format }`.
- **Miniflare seam — `Miniflare.prototype.unstable_getConfig()`**: returns the most-recently-assembled `workerd` `Config` (captured in `#assembleAndUpdateConfig`). This is how `wrangler compile` will obtain the fully-resolved service graph **without** re-deriving it or round-tripping through the lossy debug JSON. Marked alpha/unstable.

**Tests (`packages/miniflare/test/standalone.spec.ts`, all passing):** unit coverage of reachability/repoint/relativize, of the emitted text + file layout, **and an end-to-end test that runs the emitted bundle under the real `workerd serve` binary** (via the `workerd` npm dep) and asserts a `200` + the worker's JSON, including a value injected through a `fromEnvironment` binding.

### New finding (matters for the Dockerfile/run model)

`workerd` resolves **`disk` service paths relative to its working directory**, while `embed` paths are resolved **relative to the `.capnp` file**. So the bundle must be **run from its own root** (`cd bundle && workerd serve config.capnp`), or disk services must be remapped at launch with `--directory-path=NAME=PATH`. The container `WORKDIR` must therefore be the bundle root. (Confirmed by the e2e test, which initially failed with `Directory named "assets:storage" not found` until `cwd` was set to the bundle dir.) The `$PORT` override continues to work via `--socket-addr=http=127.0.0.1:$PORT`.

## 16. Phase 1 progress — `wrangler compile` + `standalone` wiring landed (in `packages/wrangler`)

The user-facing surface is now implemented and verified end-to-end against a fixture (stateless `fetch` + `vars` + static assets) running under the bare `workerd` binary.

- **`standalone` config field** (`@cloudflare/workers-utils`): `"standalone": boolean` in `wrangler.json`, validated and normalized like other top-level flags. A shared `standalone-support.ts` classifies each binding type as `supported` (stateless/pure-workerd: vars, secrets, wasm, text/data/json, assets, service bindings, …) or `unsupported` (stateful/platform: KV, R2, D1, Queues, Durable Objects, AI, Browser, Vectorize, …). This is the single source of truth for the dev warning and the compile error.
- **`wrangler compile`** (`packages/wrangler/src/compile/index.ts`, registered as a top-level command, `status: experimental`):
  1. Validates bindings via the shared `standalone-support` matrix; errors on unsupported bindings unless `--force`.
  2. Builds the worker by reusing the existing `deploy --dry-run --outfile` pipeline (no Cloudflare account needed), then parses the bundle's `FormData` into Miniflare `ModuleDefinition[]` (entry module first). This reuses `check startup`'s bundle→modules helpers (`parseFormDataFromFile`, `convertWorkerBundleToModules`, now exported).
  3. Derives bindings/assets/compat via `unstable_getMiniflareWorkerOptions(config, env)`, drives a quiet `new Miniflare({ workers: [...] })`, reads the resolved graph via `unstable_getConfig()`, and disposes.
  4. `emitStandaloneBundle(...)` writes the config (`text` `config.capnp` + embeds, or `binary` `config.bin`) + on-disk assets; then writes a `$PORT`-aware `entrypoint.sh`, a `Dockerfile` (`node:20-slim` + `npm install workerd@<pinned-version>`, `WORKDIR /app`), a human-facing `README.md` (local/npx/Docker/PaaS run instructions), and a `COMPILE_REPORT.md` (entry service, kept/dropped services, pruned extensions, warnings).
  - Default output dir `dist-standalone`; `--outdir` to override; `--force` to compile past unsupported bindings; `--format text|binary` to pick the config encoding; `--serve` (+ `--port`/`--ip`) to run the emitted bundle locally under the bundled `workerd` binary.
- **`wrangler deploy` guard**: errors when `config.standalone` is set and it is **not** a `--dry-run` (dry-run is intentionally allowed because `compile` reuses it internally). Message points the user to `wrangler compile`.
- **`wrangler dev` warning**: a hidden `--standalone` flag plus `config.standalone` trigger a best-effort, non-fatal warning listing bindings that work in local dev but aren't yet supported by `compile`. Multi-config (`-c a -c b`) dev is skipped for now.

**Verified:** `wrangler compile` on the fixture produced a runnable bundle; `workerd serve config.capnp` served `/api/*` (dynamic worker + `env.GREETING`) and `/` (static `index.html`) correctly. `wrangler deploy` errored on `standalone`; `wrangler deploy --dry-run` succeeded. `wrangler dev` emitted the unsupported-binding warning for a KV binding. Changeset added (`wrangler`/`miniflare` minor).

### Known rough edges (acceptable for alpha)

- ~~The user worker's emitted module name reflects the dry-run bundle's absolute path~~ — fixed: `modulesRoot` is set to the deepest common module dir, so the entry emits as `index.js`.
- Compile briefly starts `workerd` (via Miniflare) just to read the assembled config — the assemble-only optimization below still applies.
- ~~Unused simulator extensions are still embedded~~ — fixed: `toStandaloneConfig` prunes extension modules nothing references; a stateless+assets bundle keeps only `miniflare:shared`.
- ~~Assets `disk` is emitted `writable`~~ — fixed: `assets:*` disk services are now emitted read-only (`writable = false`).

### Tests (landed)

- `packages/wrangler/e2e/compile.test.ts` — compile a fixture → assert `config.capnp`/`Dockerfile`/`entrypoint.sh`/`COMPILE_REPORT.md` + copied assets; unsupported-binding error; `--force`; `--serve` runs the bundle under bare `workerd` and serves dynamic + static + 404.
- `packages/miniflare/test/standalone.spec.ts` — `toStandaloneConfig`/`emitStandaloneBundle` (reachability, read-only assets disk, extension pruning incl. transitive + `pruneExtensions: false`) and a bare `workerd serve` smoke test.
- `packages/wrangler/src/__tests__/standalone.test.ts` — deploy guard + dry-run + binding-issue helpers.
- `packages/vite-plugin-cloudflare/src/__tests__/standalone-build.spec.ts` (programmatic `vite build` emits the bundle; disabled by default) + `resolve-plugin-config.spec.ts` standalone resolution.
- `packages/workers-utils/tests/config/standalone-support.test.ts` + `standalone` validation cases.

### Still to do for Phase 1

- **`--format binary`** to emit `serializeConfig` output instead of text. _(`--serve` is done — see §6 / §8.6. Output-quality cleanups — module path, extension pruning, read-only assets disk — are done.)_
- **Optimization (later):** assemble-only path so `compile` doesn't briefly start `workerd` just to read the config.
- **Bundle `README.md`** + workerd version pinning in the Dockerfile/report.

## 17. Phase 1 progress — Vite `standalone` mode landed (in `packages/vite-plugin-cloudflare`)

`@cloudflare/vite-plugin`'s `cloudflare()` factory gains a `standalone?: boolean | { outDir?: string; force?: boolean }` option. When set, `vite build` emits the same standalone `workerd` bundle as `wrangler compile`, reusing **one implementation** (no duplicated assembly/emit logic).

- **Shared orchestration.** Wrangler's compile pipeline was refactored into `runStandaloneCompile(config, …)` and a programmatic `unstable_compileStandalone({ configPath, outDir, force })`, exported from the `wrangler` package root (`src/cli.ts`). The CLI command and the Vite plugin both call it.
- **How the Vite path works.** Vite's normal build already emits a deployable per-Worker `wrangler.json` (with `no_bundle: true`, `main`, `rules`, `assets.directory`) plus client assets, and a `.wrangler/deploy/config.json`. After the build is finalized, `emitStandaloneBuild()` reads the entry Worker's generated `wrangler.json` from the deploy config and hands it to `unstable_compileStandalone()`. Because the Worker is already bundled, the internal `deploy --dry-run` step simply collects the prebuilt modules — so assets, bindings, and compat flow through unchanged.
- **Version-robust integration seam.** The emit must run _after_ the build is fully finalized (deploy config + `wrangler.json` written, `removeAssetsField` applied). It is wired in two guarded places mirroring the existing `removeAssetsField` split: `standalonePlugin`'s `buildApp` post hook (Vite 7/8) and the end of `createBuildApp` via a `wrapBuildAppWithStandalone` wrapper guarded by `!satisfiesMinimumViteVersion("7.0.0")` (Vite 6). Exactly one fires per build.
- **`no named imports from "wrangler"`** rule respected — the plugin calls `wrangler.unstable_compileStandalone(...)` via the namespace import.

**Verified:** a `cloudflare({ standalone: true })` fixture (worker `fetch` + `vars` + `public/` assets) built with `vite build` (Vite 8) emitted `dist-standalone/` with `config.capnp` (entry `assets:router:<name>`), embedded modules, and `disk/assets_storage/index.html`; running it under bare `workerd serve` returned the dynamic `/api/*` JSON (with `env.GREETING`) and the static `/` HTML.

### Vite-specific limitations (alpha)

- **Entry Worker only.** Auxiliary Workers in the deploy config are not yet compiled into the bundle (a warning is logged). Tied to the cross-bundle service-binding question (§8.5).
- Shares §16's remaining rough edge (compile briefly starts `workerd` to read the config); the module-path, extension-pruning, and read-only-disk cleanups apply to the Vite path too.
- A custom `builder.buildApp` in user Vite config bypasses the Vite 6 wrapper (Vite 7+ post hook still fires).
