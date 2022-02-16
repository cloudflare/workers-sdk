# wrangler

## 0.0.17

### Patch Changes

- [#414](https://github.com/cloudflare/wrangler2/pull/414) [`f30426f`](https://github.com/cloudflare/wrangler2/commit/f30426fad5cd0be7f8a2e197a6ea279c0798bf15) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: support `build.upload.dir` when using `build.upload.main`

  Although, `build.upload.dir` is deprecated, we should still support using it when the entry-point is being defined by the `build.upload.main` and the format is `modules`.

  Fixes #413

* [#447](https://github.com/cloudflare/wrangler2/pull/447) [`2c5c934`](https://github.com/cloudflare/wrangler2/commit/2c5c934ce3343bbda0430fe91e1ea3eb94757fa3) Thanks [@threepointone](https://github.com/threepointone)! - fix: Config should be resolved relative to the entrypoint

  During `dev` and `publish`, we should resolve `wrangler.toml` starting from the entrypoint, and then working up from there. Currently, we start from the directory from which we call `wrangler`, this changes that behaviour to start from the entrypoint instead.

  (To implement this, I made one big change: Inside commands, we now have to explicitly read configuration from a path, instead of expecting it to 'arrive' coerced into a configuration object.)

- [#472](https://github.com/cloudflare/wrangler2/pull/472) [`804523a`](https://github.com/cloudflare/wrangler2/commit/804523aff70e7dd76aea25e22d4a7530da62b748) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - bugfix: Replace `.destroy()` on `faye-websockets` with `.close()`
  added: Interface to give faye same types as compliant `ws` with additional `.pipe()` implementation; `.on("message" => fn)`

* [#462](https://github.com/cloudflare/wrangler2/pull/462) [`a173c80`](https://github.com/cloudflare/wrangler2/commit/a173c80a6acd07dcce8b4d8c11d3577b19efb1f9) Thanks [@caass](https://github.com/caass)! - Add filtering to wrangler tail, so you can now `wrangler tail <name> --status ok`, for example. Supported options:

  - `--status cancelled --status error` --> you can filter on `ok`, `error`, and `cancelled` to only tail logs that have that status
  - `--header X-CUSTOM-HEADER:somevalue` --> you can filter on headers, including ones that have specific values (`"somevalue"`) or just that contain any header (e.g. `--header X-CUSTOM-HEADER` with no colon)
  - `--method POST --method PUT` --> filter on the HTTP method used to trigger the worker
  - `--search catch-this` --> only shows messages that contain the phrase `"catch-this"`. Does not (yet!) support regular expressions
  - `--ip self --ip 192.0.2.232` --> only show logs from requests that originate from the given IP addresses. `"self"` will be replaced with the IP address of the computer that sent the tail request.

- [#471](https://github.com/cloudflare/wrangler2/pull/471) [`21cde50`](https://github.com/cloudflare/wrangler2/commit/21cde504de028e58af3dc4c0e0d3f2726c7f4c1d) Thanks [@caass](https://github.com/caass)! - Add tests for wrangler tail:

  - ensure the correct API calls are made
  - ensure that filters are sent
  - ensure that the _correct_ filters are sent
  - ensure that JSON gets spat out into the terminal

* [#398](https://github.com/cloudflare/wrangler2/pull/398) [`40d9553`](https://github.com/cloudflare/wrangler2/commit/40d955341d6c14fde51ff622a9c7371e5c6049c1) Thanks [@threepointone](https://github.com/threepointone)! - feat: guess-worker-format

  This formalises the logic we use to "guess"/infer what a worker's format is - either "modules" or "service worker". Previously we were using the output of the esbuild process metafile to infer this, we now explicitly do so in a separate step (esbuild's so fast that it doesn't have any apparent performance hit, but we also do a simpler form of the build to get this information).

  This also adds `--format` as a command line arg for `publish`.

- [#438](https://github.com/cloudflare/wrangler2/pull/438) [`64d62be`](https://github.com/cloudflare/wrangler2/commit/64d62bede0ccb4f66e4a474a2c7f100606c65042) Thanks [@Electroid](https://github.com/Electroid)! - feat: Add support for "json" bindings

  Did you know? We have support for "json" bindings! Here are a few examples:

  [vars]
  text = "plain ol' string"
  count = 1
  complex = { enabled = true, id = 123 }

* [#422](https://github.com/cloudflare/wrangler2/pull/422) [`ef13735`](https://github.com/cloudflare/wrangler2/commit/ef137352697e440a0007c5a099503ad2f4526eaf) Thanks [@threepointone](https://github.com/threepointone)! - chore: rename `open-in-brower.ts` to `open-in-browser.ts`

- [#411](https://github.com/cloudflare/wrangler2/pull/411) [`a52f0e0`](https://github.com/cloudflare/wrangler2/commit/a52f0e00f85fa7602f30b9540b060b60968adf23) Thanks [@ObsidianMinor](https://github.com/ObsidianMinor)! - feat: unsafe-bindings

  Adds support for "unsafe bindings", that is, bindings that aren't supported by wrangler, but are
  desired when uploading a Worker to Cloudflare. This allows you to use beta features before
  official support is added to wrangler, while also letting you migrate to proper support for the
  feature when desired. Note: these bindings may not work everywhere, and may break at any time.

* [#415](https://github.com/cloudflare/wrangler2/pull/415) [`d826f5a`](https://github.com/cloudflare/wrangler2/commit/d826f5aae2d05023728d8ee5e30ffb79c0d674a5) Thanks [@threepointone](https://github.com/threepointone)! - fix: don't crash when browser windows don't open

  We open browser windows for a few things; during `wrangler dev`, and logging in. There are environments where this doesn't work as expected (like codespaces, stackblitz, etc). This fix simply logs an error instead of breaking the flow. This is the same fix as https://github.com/cloudflare/wrangler2/pull/263, now applied to the rest of wrangler.

- [`91d8994`](https://github.com/cloudflare/wrangler2/commit/91d89943cda26a197cb7c8d752d7953a97fac338) Thanks [@Mexican-Man](https://github.com/Mexican-Man)! - fix: do not merge routes with different methods when computing pages routes

  Fixes #92

* [#474](https://github.com/cloudflare/wrangler2/pull/474) [`bfedc58`](https://github.com/cloudflare/wrangler2/commit/bfedc585f151898615b3546fc67d97055e32d6ed) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - bugfix: create `reporting.toml` file in "wrangler/config" and move error reporting user decisions to new `reporting.toml`

- [#445](https://github.com/cloudflare/wrangler2/pull/445) [`d5935e7`](https://github.com/cloudflare/wrangler2/commit/d5935e7c4fde9e3b900be7c08bca09e80e9fdc8a) Thanks [@threepointone](https://github.com/threepointone)! - chore: remove `experimental_services` from configuration

  Now that we have `[[unsafe.bindings]]` (as of https://github.com/cloudflare/wrangler2/pull/411), we should use that for experimental features. This removes support for `[experimental_services]`, and adds a helpful message for how to rewrite their configuration.

  This error is temporary, until the internal teams that were using this rewrite their configs. We'll remove it before GA.

  What the error looks like -

  ```
  Error: The "experimental_services" field is no longer supported. Instead, use [[unsafe.bindings]] to enable experimental features. Add this to your wrangler.toml:

  [[unsafe.bindings]]
  name = "SomeService"
  type = "service"
  service = "some-service"
  environment = "staging"

  [[unsafe.bindings]]
  name = "SomeOtherService"
  type = "service"
  service = "some-other-service"
  environment = "qa"
  ```

* [#456](https://github.com/cloudflare/wrangler2/pull/456) [`b5f42c5`](https://github.com/cloudflare/wrangler2/commit/b5f42c587300c313bdebab4d364d0c7759e39752) Thanks [@threepointone](https://github.com/threepointone)! - chore: enable `strict` in `tsconfig.json`

  In the march towards full strictness, this enables `strict` in `tsconfig.json` and fixes the errors it pops up. A changeset is included because there are some subtle code changes, and we should leave a trail for them.

- [#408](https://github.com/cloudflare/wrangler2/pull/408) [`14098af`](https://github.com/cloudflare/wrangler2/commit/14098af0886b0cbdda90823527ca6037770375b3) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to [`2.3.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.3.0)

* [#448](https://github.com/cloudflare/wrangler2/pull/448) [`b72a111`](https://github.com/cloudflare/wrangler2/commit/b72a111bbe92dc3b83a3d9e59ff3b5935bee7dbc) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: add `--yes` with alias `--y` flag as automatic answer to all prompts and run `wrangler init` non-interactively.
  generated during setup:

  - package.json
  - TypeScript, which includes tsconfig.json & `@cloudflare/workers-types`
  - Template "hello world" Worker at src/index.ts

- [#403](https://github.com/cloudflare/wrangler2/pull/403) [`f9fef8f`](https://github.com/cloudflare/wrangler2/commit/f9fef8fbfe74d6a591ca1640639a18798c5469e6) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: add scripts to package.json & autogenerate name value when initializing a project
  To get wrangler init projects up and running with good ergonomics for deploying and development,
  added default scripts "start" & "deploy" with assumed TS or JS files in generated ./src/index.
  The name property is now derived from user input on `init <name>` or parent directory if no input is provided.

* [#452](https://github.com/cloudflare/wrangler2/pull/452) [`1cf6701`](https://github.com/cloudflare/wrangler2/commit/1cf6701f372f77c45dc460de81979128d3efebc2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add support for publishing workers with r2 bucket bindings

  This change adds the ability to define bindings in your `wrangler.toml` file
  for R2 buckets. These buckets will then be available in the environment
  passed to the worker at runtime.

  Closes #365

- [#458](https://github.com/cloudflare/wrangler2/pull/458) [`a8f97e5`](https://github.com/cloudflare/wrangler2/commit/a8f97e57a571df5acdd9512d5d992d65730c75fd) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: do not publish to workers.dev if workers_dev is false

  Previously we always published to the workers.dev subdomain, ignoring the `workers_dev` setting in the `wrangler.toml` configuration.

  Now we respect this configuration setting, and also disable an current workers.dev subdomain worker when we publish and `workers_dev` is `false`.

  Fixes #410

* [#457](https://github.com/cloudflare/wrangler2/pull/457) [`b249e6f`](https://github.com/cloudflare/wrangler2/commit/b249e6fb34c616ff54edde830bbdf8f5279991fb) Thanks [@threepointone](https://github.com/threepointone)! - fix: don't report intentional errors

  We shouldn't be reporting intentional errors, only exceptions. This removes reporting for all caught errors for now, until we filter all known errors, and then bring back reporting for unknown errors. We also remove a stray `console.warn()`.

- [#402](https://github.com/cloudflare/wrangler2/pull/402) [`5a9bb1d`](https://github.com/cloudflare/wrangler2/commit/5a9bb1dd6510511607c268e1709e0caa95d68f92) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: Added Wrangler TOML fields
  Additional field to get projects ready to publish as soon as possible.
  It will check if the Worker is named, if not then it defaults to using the parent directory name.

* [#227](https://github.com/cloudflare/wrangler2/pull/227) [`97e15f5`](https://github.com/cloudflare/wrangler2/commit/97e15f5372d298378e5bafd62798cddd6eeda27c) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feature: Sentry Integration
  Top level exception logging which will allow to Pre-empt issues, fix bugs faster,
  Identify uncommon error scenarios, and better quality error information. Context includes of Error in addition to stacktrace
  Environment:
  OS/arch
  node/npm versions
  wrangler version
  RewriteFrames relative pathing of stacktrace and will prevent user file system information
  from being sent.

  Sourcemaps:

  - The sourcemap custom scripts for path matching in Artifact, Sentry Event and Build output is moved to be handled in GH Actions
    Sentry upload moved after changeset version bump script and npm script to get current version into GH env variable
  - Add org and project to secrets for increased obfuscation of Cloudflare internal ecosystem

  Prompt for Opt-In:

  - When Error is thrown user will be prompted with yes (only sends this time), Always, and No (default). Always and No
    will be added to default.toml with a datetime property for future update checks.
  - If the property already exists it will skip the prompt.

  Sentry Tests:
  The tests currently check that the decision flow works as currently set up then checks if Sentry is able
  to send events or is disabled.

- [#427](https://github.com/cloudflare/wrangler2/pull/427) [`bce731a`](https://github.com/cloudflare/wrangler2/commit/bce731a5cfccb1dc5a79fb15b31c7c15e3adcdb4) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: share worker bundling between both `publish` and `dev` commands

  This changes moves the code that does the esbuild bundling into a shared file
  and updates the `publish` and `dev` to use it, rather than duplicating the
  behaviour.

  See #396
  Resolves #401

* [#458](https://github.com/cloudflare/wrangler2/pull/458) [`c0cfd60`](https://github.com/cloudflare/wrangler2/commit/c0cfd604b2f114f06416374cfadae08cdef15d3c) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: pass correct query param when uploading a script

  In f9c1423f0c5b6008f05b9657c9b84eb6f173563a the query param was incorrectly changed from
  `available_on_subdomain` to `available_on_subdomains`.

- [#432](https://github.com/cloudflare/wrangler2/pull/432) [`78acd24`](https://github.com/cloudflare/wrangler2/commit/78acd24f539942bf094a3a47aca995b0cfd3ef03) Thanks [@threepointone](https://github.com/threepointone)! - feat: import `.wasm` modules in service worker format workers

  This allows importing `.wasm` modules in service worker format workers. We do this by hijacking imports to `.wasm` modules, and instead registering them under `[wasm_modules]` (building on the work from https://github.com/cloudflare/wrangler2/pull/409).

* [#409](https://github.com/cloudflare/wrangler2/pull/409) [`f8bb523`](https://github.com/cloudflare/wrangler2/commit/f8bb523ed1a41f20391381e5d130b2685558002e) Thanks [@threepointone](https://github.com/threepointone)! - feat: support `[wasm_modules]` for service-worker format workers

  This lands support for `[wasm_modules]` as defined by https://github.com/cloudflare/wrangler/pull/1677.

  wasm modules can be defined in service-worker format with configuration in wrangler.toml as -

  ```
  [wasm_modules]
  MYWASM = "./path/to/my-wasm.wasm"
  ```

  The module will then be available as the global `MYWASM` inside your code. Note that this ONLY makes sense in service-worker format workers (for now).

  (In the future, we MAY enable wasm module imports in service-worker format (i.e. `import MYWASM from './path/to/my-wasm.wasm'`) and global imports inside modules format workers.)

- [#423](https://github.com/cloudflare/wrangler2/pull/423) [`dd9058d`](https://github.com/cloudflare/wrangler2/commit/dd9058d134eead969841136279e57df8203e84d9) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add support for managing R2 buckets

  This change introduces three new commands, which manage buckets under the current account:

  - `r2 buckets list`: list information about all the buckets.
  - `r2 buckets create`: create a new bucket - will error if the bucket already exists.
  - `r2 buckets delete`: delete a bucket.

  This brings Wrangler 2 inline with the same features in Wrangler 1.

* [#455](https://github.com/cloudflare/wrangler2/pull/455) [`80aa106`](https://github.com/cloudflare/wrangler2/commit/80aa10660ee0ef1e6e571b1312a2aa4c8562f543) Thanks [@threepointone](https://github.com/threepointone)! - fix: error when entry doesn't exist

  This adds an error when we use an entry point that doesn't exist, either for `wrangler dev` or `wrangler publish`, and either via cli arg or `build.upload.main` in `wrangler.toml`. By using a common abstraction for `dev` and `publish`, This also adds support for using `build.config.main`/`build.config.dir` for `wrangler dev`.

  - Fixes https://github.com/cloudflare/wrangler2/issues/418
  - Fixes https://github.com/cloudflare/wrangler2/issues/390

## 0.0.16

### Patch Changes

- [#364](https://github.com/cloudflare/wrangler2/pull/364) [`3575892`](https://github.com/cloudflare/wrangler2/commit/3575892f99d7a77031d566a12b4a383c886cc64f) Thanks [@threepointone](https://github.com/threepointone)! - enhance: small tweaks to `wrangler init`

  - A slightly better `package.json`
  - A slightly better `tsconfig.json`
  - installing `typescript` as a dev dependency

* [#380](https://github.com/cloudflare/wrangler2/pull/380) [`aacd1c2`](https://github.com/cloudflare/wrangler2/commit/aacd1c2a4badb273878cda13fda56e4b21bdd9cd) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: ensure pages routes are defined correctly

  In e151223 we introduced a bug where the RouteKey was now an array rather than a simple URL string. When it got stringified into the routing object these were invalid.
  E.g. `[':page*', undefined]` got stringified to `":page*,"` rather than `":page*"`.

  Fixes #379

- [#329](https://github.com/cloudflare/wrangler2/pull/329) [`27a1f3b`](https://github.com/cloudflare/wrangler2/commit/27a1f3b303fab855592f9ca980c770a4a0d85ec6) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - ci: run PR jobs on both Ubuntu, MacOS and Windows

  - update .gitattributes to be consistent on Windows
  - update Prettier command to ignore unknown files
    Windows seems to be more brittle here.
  - tighten up eslint config
    Windows seems to be more brittle here as well.
  - use the matrix.os value in the cache key
    Previously we were using `running.os` but this appeared not to be working.

* [#347](https://github.com/cloudflare/wrangler2/pull/347) [`ede5b22`](https://github.com/cloudflare/wrangler2/commit/ede5b2219fe636e376ae8a0e56978a33df448215) Thanks [@threepointone](https://github.com/threepointone)! - fix: hide `wrangler pages functions` in the main help menu

  This hides `wrangler pages functions` in the main help menu, since it's only intended for internal usage right now. It still "works", so nothing changes in that regard. We'll bring this back when we have a broader story in wrangler for functions.

- [#360](https://github.com/cloudflare/wrangler2/pull/360) [`f590943`](https://github.com/cloudflare/wrangler2/commit/f5909437a17954b4182823a14dfbc51b0433d971) Thanks [@threepointone](https://github.com/threepointone)! - fix: `kv:key get`

  The api for fetching a kv value, unlike every other cloudflare api, returns just the raw value as a string (as opposed to the `FetchResult`-style json). However, our fetch utility tries to convert every api response to json before parsing it further. This leads to bugs like https://github.com/cloudflare/wrangler2/issues/359. The fix is to special case for `kv:key get`.

  Fixes https://github.com/cloudflare/wrangler2/issues/359.

* [#373](https://github.com/cloudflare/wrangler2/pull/373) [`6e7baf2`](https://github.com/cloudflare/wrangler2/commit/6e7baf2afd7bdda3e15484086279d298a63abaa2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: use the appropriate package manager when initializing a wrangler project

  Previously, when we initialized a project using `wrangler init`, we always used npm as the package manager.

  Now we check to see whether npm and yarn are actually installed, and also whether there is already a lock file in place before choosing which package manager to use.

  Fixes #353

- [#363](https://github.com/cloudflare/wrangler2/pull/363) [`0add2a6`](https://github.com/cloudflare/wrangler2/commit/0add2a6a6d7d861e5a6047873a473d5156e8ca89) Thanks [@threepointone](https://github.com/threepointone)! - fix: support uppercase hotkeys in `wrangler dev`

  Just a quick fix to accept uppercase hotkeys during `dev`.

* [#331](https://github.com/cloudflare/wrangler2/pull/331) [`e151223`](https://github.com/cloudflare/wrangler2/commit/e1512230e8109afe905dd9bea46f638652906921) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: generate valid URL route paths for pages on Windows

  Previously route paths were manipulated by file-system path utilities.
  On Windows this resulted in URLs that had backslashes, which are invalid for such URLs.

  Fixes #51
  Closes #235
  Closes #330
  Closes #327

- [#338](https://github.com/cloudflare/wrangler2/pull/338) [`e0d2f35`](https://github.com/cloudflare/wrangler2/commit/e0d2f35542bc37636098a30469e93702dd7a0d35) Thanks [@threepointone](https://github.com/threepointone)! - feat: environments for Worker Sites

  This adds environments support for Workers Sites. Very simply, it uses a separate kv namespace that's indexed by the environment name. This PR also changes the name of the kv namespace generated to match wrangler 1's implementation.

* [#329](https://github.com/cloudflare/wrangler2/pull/329) [`e1d2198`](https://github.com/cloudflare/wrangler2/commit/e1d2198b6454fead8a0115c2ed92a37b9def6dba) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - test: support testing in CI on Windows

  - Don't rely on bash variables to configure tests
    The use of bash variables in the `npm test` script is not supported in Windows Powershell, causing CI on Windows to fail.
    These bash variables are used to override the API token and the Account ID.

    This change moves the control of mocking these two concepts into the test code, by adding `mockAccountId()` and `mockApiToken()` helpers.

    - The result is slightly more boilerplate in tests that need to avoid hitting the auth APIs.
    - But there are other tests that had to revert these environment variables. So the boilerplate is reduced there.

  - Sanitize command line for snapshot tests
    This change applies `normalizeSlashes()` and `trimTimings()` to command line outputs and error messages to avoid inconsistencies in snapshots.
    The benefit here is that authors do not need to keep adding them to all their snapshot tests.

  - Move all the helper functions into their own directory to keep the test directory cleaner.

- [#380](https://github.com/cloudflare/wrangler2/pull/380) [`aacd1c2`](https://github.com/cloudflare/wrangler2/commit/aacd1c2a4badb273878cda13fda56e4b21bdd9cd) Thanks [@GregBrimble](https://github.com/GregBrimble)! - refactor: clean up pages routing

* [#343](https://github.com/cloudflare/wrangler2/pull/343) [`cfd8ba5`](https://github.com/cloudflare/wrangler2/commit/cfd8ba5fa6b82968e5f8c5cce657e7c9eb468fc6) Thanks [@threepointone](https://github.com/threepointone)! - chore: update esbuild

  Update esbuild to 0.14.14. Also had to change `import esbuild from "esbuild";` to `import * as esbuild from "esbuild";` in `dev.tsx`.

- [#371](https://github.com/cloudflare/wrangler2/pull/371) [`85ceb84`](https://github.com/cloudflare/wrangler2/commit/85ceb84c474a20b191a475719196eed9674a8e77) Thanks [@nrgnrg](https://github.com/nrgnrg)! - fix: pages advanced mode usage

  Previously in pages projects using advanced mode (a single `_worker.js` or `--script-path` file rather than a `./functions` folder), calling `pages dev` would quit without an error and not launch miniflare.

  This change fixes that and enables `pages dev` to be used with pages projects in advanced mode.

* [#383](https://github.com/cloudflare/wrangler2/pull/383) [`969c887`](https://github.com/cloudflare/wrangler2/commit/969c887bfc371dc16d0827589ad21a68ea0b3a89) Thanks [@threepointone](https://github.com/threepointone)! - fix: remove redundant process.cwd() calls in `wrangler init`

  Followup from https://github.com/cloudflare/wrangler2/pull/372#discussion_r798854509, just removing some unnecessary calls to `process.cwd()`/`path.join()`, since they're already relative to where they're called from.

- [#329](https://github.com/cloudflare/wrangler2/pull/329) [`ac168f4`](https://github.com/cloudflare/wrangler2/commit/ac168f4f62851ad3fe2e2705655baf8229c421ea) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: use helpers to manage npm commands

  This change speeds up tests and avoids us checking that npm did what it is supposed to do.

* [#348](https://github.com/cloudflare/wrangler2/pull/348) [`b8e3b01`](https://github.com/cloudflare/wrangler2/commit/b8e3b0124656ae3eb82fdebf1fcaaa056612ff1e) Thanks [@threepointone](https://github.com/threepointone)! - chore: replace `node-fetch` with `undici`

  There are several reasons to replace `node-fetch` with `undici`:

  - `undici`'s `fetch()` implementation is set to become node's standard `fetch()` implementation, which means we can just remove the dependency in the future (or optionally load it depending on which version of node is being used)
  - `node-fetch` pollutes the global type space with a number of standard types
  - we already bundle `undici` via `miniflare`/pages, so this means our bundle size could ostensibly become smaller.

  This replaces `node-fetch` with `undici`.

  - All instances of `import fetch from "node-fetch"` are replaced with `import {fetch} from "undici"`
  - `undici` also comes with spec compliant forms of `FormData` and `File`, so we could also remove `formdata-node` in `form_data.ts`
  - All the global types that were injected by `node-fetch` are now imported from `undici` (as well as some mistaken ones from `node:url`)
  - NOTE: this also turns on `skipLibCheck` in `tsconfig.json`. Some dependencies oddly depend on browser globals like `Request`, `Response` (like `@miniflare/core`, `jest-fetch-mock`, etc), which now fail because `node-fetch` isn't injecting those globals anymore. So we enable `skipLibCheck` to bypass them. (I'd thought `skipLibCheck` completely ignores 'third party' types, but that's not true - it still uses the module graph to scan types. So we're still typesafe. We should enable `strict` sometime to avoid `any`s, but that's for later.)
  - The bundle size isn't smaller because we're bundling 2 different versions of `undici`, but we'll fix that by separately upping the version of `undici` that miniflare bundles.

- [#357](https://github.com/cloudflare/wrangler2/pull/357) [`41cfbc3`](https://github.com/cloudflare/wrangler2/commit/41cfbc3b20fa79313c0a7236530c519876a05fc9) Thanks [@threepointone](https://github.com/threepointone)! - chore: add eslint-plugin-import

  - This adds `eslint-plugin-import` to enforce ordering of imports, and configuration for the same in `package.json`.
  - I also run `npm run check:lint -- --fix` to apply the configured order in our whole codebase.
  - This also needs a setting in `.vscode/settings.json` to prevent spurious warnings inside vscode. You'll probably have to restart your IDE for this to take effect. (re: https://github.com/import-js/eslint-plugin-import/issues/2377#issuecomment-1024800026)

  (I'd also like to enforce using `node:` prefixes for node builtin modules, but that can happen later. For now I manually added the prefixes wherever they were missing. It's not functionally any different, but imo it helps the visual grouping.)

* [#372](https://github.com/cloudflare/wrangler2/pull/372) [`05dbb0d`](https://github.com/cloudflare/wrangler2/commit/05dbb0d6f5d838b414ee84824f0f87571d18790f) Thanks [@threepointone](https://github.com/threepointone)! - feat: `wrangler init` offers to create a starter worker

  We got feedback that `wrangler init` felt incomplete, because the immediate next thing folks need is a starter source file. So this adds another step to `wrangler init` where we offer to create that file for you.

  Fixes https://github.com/cloudflare/wrangler2/issues/355

- [#384](https://github.com/cloudflare/wrangler2/pull/384) [`8452485`](https://github.com/cloudflare/wrangler2/commit/84524850582dc25c99a76c314997eea37666ceb3) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: use xxhash-wasm for better compatibility with Windows

  The previous xxhash package we were using required a build step, which relied upon tooling that was not always available on Window.

  This version is a portable WASM package.

* [#334](https://github.com/cloudflare/wrangler2/pull/334) [`536c7e5`](https://github.com/cloudflare/wrangler2/commit/536c7e5e9472d876053d0d2405d045a2faf8e074) Thanks [@threepointone](https://github.com/threepointone)! - feat: wasm support for local mode in `wrangler dev`

  This adds support for `*.wasm` modules into local mode for `wrangler dev`.

  In 'edge' mode, we create a javascript bundle, but wasm modules are uploaded to the preview server directly when making the worker definition form upload. However, in 'local' mode, we need to have the actual modules available to the bundle. So we copy the files over to the bundle path. We also pass appropriate `--modules-rule` directive to `miniflare`.

  I also added a sample wasm app to use for testing, created from a default `workers-rs` project.

  Fixes https://github.com/cloudflare/wrangler2/issues/299

- [#329](https://github.com/cloudflare/wrangler2/pull/329) [`b8a3e78`](https://github.com/cloudflare/wrangler2/commit/b8a3e785e4e4c348ff3495f2d0f9896e23a2b045) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - ci: use `npm ci` and do not cache workspace packages in node_modules

  Previously we were caching all the `node_modules` files in the CI jobs and then running `npm install`. While this resulted in slightly improved install times on Ubuntu, it breaks on Windows because the npm workspace setup adds symlinks into node_modules, which the Github cache action cannot cope with.

  This change removes the `node_modules` caches (saving some time by not needing to restore them) and replaces `npm install` with `npm ci`.

  The `npm ci` command is actually designed to be used in CI jobs as it only installs the exact versions specified in the `package-lock.json` file, guaranteeing that for any commit we always have exactly the same CI job run, deterministically.

  It turns out that, on Ubuntu, using `npm ci` makes very little difference to the installation time (~30 secs), especially if there is no `node_modules` there in the first place.

  Unfortunately, MacOS is slower (~1 min), and Windows even worse (~2 mins)! But it is worth this longer CI run to be sure we have things working on all OSes.

## 0.0.15

### Patch Changes

- [#333](https://github.com/cloudflare/wrangler2/pull/333) [`6320a32`](https://github.com/cloudflare/wrangler2/commit/6320a32fb867573b94403354d54ec7d5180304c4) Thanks [@threepointone](https://github.com/threepointone)! - fix: pass worker name to syncAssets in `dev`

  This fix passes the correct worker name to `syncAssets` during `wrangler dev`. This function uses the name to create the backing kv store for a Workers Sites definition, so it's important we get the name right.

  I also fixed the lint warning introduced in https://github.com/cloudflare/wrangler2/pull/321, to pass `props.enableLocalPersistence` as a dependency in the `useEffect` call that starts the "local" mode dev server.

* [#335](https://github.com/cloudflare/wrangler2/pull/335) [`a417cb0`](https://github.com/cloudflare/wrangler2/commit/a417cb0ad40708755e55bd299e282e6862aa155d) Thanks [@threepointone](https://github.com/threepointone)! - fix: prevent infinite loop when fetching a list of results

  When fetching a list of results from cloudflare APIs (e.g. when fetching a list of keys in a kv namespace), the api returns a `cursor` that a consumer should use to get the next 'page' of results. It appears this cursor can also be a blank string (while we'd only account for it to be `undefined`). By only accounting for it to be `undefined`, we were infinitely looping through the same page of results and never terminating. This PR fixes it by letting it be a blank string (and `null`, for good measure)

- [#332](https://github.com/cloudflare/wrangler2/pull/332) [`a2155c1`](https://github.com/cloudflare/wrangler2/commit/a2155c1ec65e271e4a5be1a19717b1aebdd647a5) Thanks [@threepointone](https://github.com/threepointone)! - fix: wait for port to be available before creating a dev server

  When we run `wrangler dev`, we start a server on a port (defaulting to 8787). We do this separately for both local and edge modes. However, when switching between the two with the `l` hotkey, we don't 'wait' for the previous server to stop before starting the next one. This can crash the process, and we don't want that (of course). So we introduce a helper function `waitForPortToBeAvailable()` that waits for a port to be available before returning. This is used in both the local and edge modes, and prevents the bug right now, where switching between edge - local - edge crashes the process.

  (This isn't a complete fix, and we can still cause errors by very rapidly switching between the two modes. A proper long term fix for the future would probably be to hoist the proxy server hook above the `<Remote/>` and `<Local/>` components, and use a single instance throughout. But that requires a deeper refactor, and isn't critical at the moment.)

* [#336](https://github.com/cloudflare/wrangler2/pull/336) [`ce61000`](https://github.com/cloudflare/wrangler2/commit/ce6100066e0c20d010f5188402077e1bd1ab4005) Thanks [@threepointone](https://github.com/threepointone)! - feat: inline text-like files into the worker bundle

  We were adding text-like modules (i.e. `.txt`, `.html` and `.pem` files) as separate modules in the Worker definition, but this only really 'works' with the ES module Worker format. This commit changes that to inline the text-like files into the Worker bundle directly.

  We still have to do something similar with `.wasm` modules, but that requires a different fix, and we'll do so in a subsequent commit.

- [#336](https://github.com/cloudflare/wrangler2/pull/336) [`ce61000`](https://github.com/cloudflare/wrangler2/commit/ce6100066e0c20d010f5188402077e1bd1ab4005) Thanks [@threepointone](https://github.com/threepointone)! - feat: Sites support for local mode `wrangler dev`

  This adds support for Workers Sites in local mode when running wrangler `dev`. Further, it fixes a bug where we were sending the `__STATIC_CONTENT_MANIFEST` definition as a separate module even with service worker format, and a bug where we weren't uploading the namespace binding when other kv namespaces weren't present.

## 0.0.14

### Patch Changes

- [#307](https://github.com/cloudflare/wrangler2/pull/307) [`53c6318`](https://github.com/cloudflare/wrangler2/commit/53c6318739d2d3672a2e508f643857bdf5831676) Thanks [@threepointone](https://github.com/threepointone)! - feat: `wrangler secret * --local`

  This PR implements `wrangler secret` for `--local` mode. The implementation is simply a no-op, since we don't want to actually write secret values to disk (I think?). I also got the messaging for remote mode right by copying from wrangler 1. Further, I added tests for all the `wrangler secret` commands.

* [#324](https://github.com/cloudflare/wrangler2/pull/324) [`b816333`](https://github.com/cloudflare/wrangler2/commit/b8163336faaeae26b68736732938cceaaf4dfec4) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Fixes `wrangler pages dev` failing to start for just a folder of static assets (no functions)

- [#317](https://github.com/cloudflare/wrangler2/pull/317) [`d6ef61a`](https://github.com/cloudflare/wrangler2/commit/d6ef61abcbc9f4b3a14222d99c9f02efa564e699) Thanks [@threepointone](https://github.com/threepointone)! - fix: restart the `dev` proxy server whenever it closes

  When we run `wrangler dev`, the session that we setup with the preview endpoint doesn't last forever, it dies after ignoring it for 5-15 minutes or so. The fix for this is to simply reconnect the server. So we use a state hook as a sigil, and add it to the dependency array of the effect that sets up the server, and simply change it every time the server closes.

  Fixes https://github.com/cloudflare/wrangler2/issues/197

  (In wrangler1, we used to restart the whole process, including uploading the worker again, making a new preview token, and so on. It looks like that they may not have been necessary.)

* [#312](https://github.com/cloudflare/wrangler2/pull/312) [`77aa324`](https://github.com/cloudflare/wrangler2/commit/77aa3249ce07d7617582e4b0555201dac9b7578e) Thanks [@threepointone](https://github.com/threepointone)! - fix: remove `--prefer-offline` when running `npm install`

  We were using `--prefer-offline` when running `npm install` during `wrangler init`. The behaviour is odd, it doesn't seem to fetch from the remote when the cache isn't hit, which is not what I'm expecting. So we remove `--prefer-offline`.

- [#311](https://github.com/cloudflare/wrangler2/pull/311) [`a5537f1`](https://github.com/cloudflare/wrangler2/commit/a5537f147e61b046e141e06d1864ffa62e1f2673) Thanks [@threepointone](https://github.com/threepointone)! - fix: custom builds should allow multiple commands

  We were running custom builds as a regular command with `execa`. This would fail whenever we tried to run compound commands like `cargo install -q worker-build && worker-build --release` (via https://github.com/cloudflare/wrangler2/issues/236). The fix is to use `shell: true`, so that the command is run in a shell and can thus use bash-y syntax like `&&`, and so on. I also switched to using `execaCommand` which splits a command string into parts correctly by itself.

* [#321](https://github.com/cloudflare/wrangler2/pull/321) [`5b64a59`](https://github.com/cloudflare/wrangler2/commit/5b64a5914ece57b2a76d2101d32abda5b8c5adb8) Thanks [@geelen](https://github.com/geelen)! - fix: disable local persistence by default & add `--experimental-enable-local-persistence` flag

  BREAKING CHANGE:

  When running `dev` locally any data stored in KV, Durable Objects or the cache are no longer persisted between sessions by default.

  To turn this back on add the `--experimental-enable-local-persistence` at the command line.

## 0.0.13

### Patch Changes

- [#293](https://github.com/cloudflare/wrangler2/pull/293) [`71b0fab`](https://github.com/cloudflare/wrangler2/commit/71b0fab02e4f65342b4b106f9dc3fa6a98db2a19) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: warn if the `site.entry-point` configuration is found during publishing

  Also updates the message and adds a test for the error when there is no entry-point specified.

  Fixes #282

* [#304](https://github.com/cloudflare/wrangler2/pull/304) [`7477b52`](https://github.com/cloudflare/wrangler2/commit/7477b52bd4b72b601b501564121fd4ee6a90aaef) Thanks [@threepointone](https://github.com/threepointone)! - feat: enhance `wrangler init`

  This PR adds some enhancements/fixes to the `wrangler init` command.

  - doesn't overwrite `wrangler.toml` if it already exists
  - installs `wrangler` when creating `package.json`
  - offers to install `wrangler` into `package.json` even if `package.json` already exists
  - offers to install `@cloudflare/workers-types` even if `tsconfig.json` already exists
  - pipes stdio back to the terminal so there's feedback when it's installing npm packages

  This does have the side effect of making out tests slower. I added `--prefer-offline` to the `npm install` calls to make this a shade quicker, but I can't figure out a good way of mocking these. I'll think about it some more later. We should work on making the installs themselves quicker (re: https://github.com/cloudflare/wrangler2/issues/66)

  This PR also fixes a bug with our tests - `runWrangler` would catch thrown errors, and if we didn't manually verify the error, tests would pass. Instead, it now throws correctly, and I modified all the tests to assert on thrown errors. It seems like a lot, but it was just mechanical rewriting.

- [#294](https://github.com/cloudflare/wrangler2/pull/294) [`7746fba`](https://github.com/cloudflare/wrangler2/commit/7746fba6d36c2361851064f68eed5feb34dc8fbc) Thanks [@threepointone](https://github.com/threepointone)! - feature: add more types that get logged via `console` methods

  This PR adds more special logic for some data types that get logged via `console` methods. Types like `Promise`, `Date`, `WeakMaps`, and some more, now get logged correctly (or at least, better than they used to).

  This PR also fixes a sinister bug - the `type` of the `ConsoleAPICalled` events don't match 1:1 with actual console methods (eg: `console.warn` message type is `warning`). This PR adds a mapping between those types and method names. Some methods don't seem to have a message type, I'm not sure why, but we'll get to them later.

* [#310](https://github.com/cloudflare/wrangler2/pull/310) [`52c99ee`](https://github.com/cloudflare/wrangler2/commit/52c99ee74aab4db05d8e061dc4c205b1114e1bcc) Thanks [@threepointone](https://github.com/threepointone)! - feat: error if a site definition doesn't have a `bucket` field

  This adds an assertion error for making sure a `[site]` definition always has a `bucket` field.As a cleanup, I made some small fixes to the `Config` type definition, and modified the tests in `publish.test.ts` to use the config format when creating a `wrangler.toml` file.

## 0.0.12

### Patch Changes

- [#292](https://github.com/cloudflare/wrangler2/pull/292) [`e5d3690`](https://github.com/cloudflare/wrangler2/commit/e5d3690429cbf8945ba6f3c954a61b794bcfdea4) Thanks [@threepointone](https://github.com/threepointone)! - fix: use entrypoint specified in esbuuild's metafile as source for building the worker

  When we pass a non-js file as entry to esbuild, it generates a `.js` file. (which, is the whole job of esbuild, haha). So, given `<source>/index.ts`, it'll generate `<destination>/index.js`. However, when we try to 'find' the matching file to pass on as an input to creating the actual worker, we try to use the original file name inside the destination directory. At this point, the extension has changed, so it doesn't find the file, and hence we get the error that looks like `ENOENT: no such file or directory, open '/var/folders/3f/fwp6mt7n13bfnkd5vl3jmh1w0000gp/T/tmp-61545-4Y5kwyNI8DGU/src/worker.ts'`

  The actual path to the destination file is actually the key of the block in `metafile.outputs` that matches the given output.entryPoint, so this PR simply rewrites the logic to use that instead.

* [#287](https://github.com/cloudflare/wrangler2/pull/287) [`b63efe6`](https://github.com/cloudflare/wrangler2/commit/b63efe60646c8c955f4df4f2ce1d87ce9cc84ba3) Thanks [@threepointone](https://github.com/threepointone)! - fix: propagate api errors to the terminal correctly

  Any errors embedded in the response from the Cloudflare API were being lost, because `fetchInternal()` would throw on a non-200 response. This PR fixes that behaviour:

  - It doesn't throw on non-200 responses
  - It first gets the response text with `.text()` and converts it to an object with `JSON.parse`, so in case the api returns a non json response, we don't lose response we were sent.

  Unfortunately, because of the nature of this abstraction, we do lose the response `status` code and `statusText`, but maybe that's acceptable since we have richer error information in the payload. I considered logging the code and text to the terminal, but that may make it noisy.

## 0.0.11

### Patch Changes

- [#242](https://github.com/cloudflare/wrangler2/pull/242) [`014a731`](https://github.com/cloudflare/wrangler2/commit/014a731a72e062e9d6a2a4e0c4a7fcecd697b872) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Refactor pages code to pass strict-null checks

* [#267](https://github.com/cloudflare/wrangler2/pull/267) [`e22f9d7`](https://github.com/cloudflare/wrangler2/commit/e22f9d7c190e8c32e1121d15ea5581d919a5ef08) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: tidy up the typings of the build result in dev

  In #262 some of the strict null fixes were removed to resolve a regression.
  This refactor re-applies these fixes in a way that avoids that problem.

- [#284](https://github.com/cloudflare/wrangler2/pull/284) [`20377e8`](https://github.com/cloudflare/wrangler2/commit/20377e80d46d91560555c212a977b90308730c4d) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Add whoami command

* [#270](https://github.com/cloudflare/wrangler2/pull/270) [`2453577`](https://github.com/cloudflare/wrangler2/commit/2453577c96704ca1d6934582796199a409d7b770) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add support for include and exclude when publishing site assets

- [#270](https://github.com/cloudflare/wrangler2/pull/270) [`0289882`](https://github.com/cloudflare/wrangler2/commit/0289882a15eba55d802650a591f999ef7b614fb6) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure `kv:key list` matches the output from Wrangler 1

  The previous output was passing an array of objects to console.log, which ended up showing something like

  ```
  [Object object]
  [Object object]
  ...
  ```

  Now the result is JSON stringified before being sent to the console.
  The tests have been fixed to check this too.

* [#258](https://github.com/cloudflare/wrangler2/pull/258) [`f9c1423`](https://github.com/cloudflare/wrangler2/commit/f9c1423f0c5b6008f05b9657c9b84eb6f173563a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: correctly handle entry-point path when publishing

  The `publish` command was failing when the entry-point was specified in the wrangler.toml file and the entry-point imported another file.

  This was because we were using the `metafile.inputs` to guess the entry-point file path. But the order in which the source-files were added to this object was not well defined, and so we could end up failing to find a match.

  This fix avoids this by using the fact that the `metadata.outputs` object will only contain one element that has the `entrypoint` property - and then using that as the entry-point path. For runtime safety, we now assert that there cannot be zero or multiple such elements.

- [#275](https://github.com/cloudflare/wrangler2/pull/275) [`e9ab55a`](https://github.com/cloudflare/wrangler2/commit/e9ab55a106937e0a7909e54715ceb1fac9fce79e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add a link to create a github issue when there is an error.

  When a (non-yargs) error surfaces to the top level,
  we know also show a link to Github to encourage the developer to report an issue.

* [#286](https://github.com/cloudflare/wrangler2/pull/286) [`b661dd0`](https://github.com/cloudflare/wrangler2/commit/b661dd066887c11fe838d25c0530ef935a55a51a) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: Update `node-fetch` to 3.1.1, run `npm audit fix` in root

  This commit addresses a secutity issue in `node-fetch` and updates it to 3.1.1. I also ran `npm audit fix` in the root directory to address a similar issue with `@changesets/get-github-info`.

- [#249](https://github.com/cloudflare/wrangler2/pull/249) [`9769bc3`](https://github.com/cloudflare/wrangler2/commit/9769bc35243f7554b16153d9656750bb09c6f296) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Do not crash when processing environment configuration.

  Previously there were corner cases where the configuration might just crash.
  These are now handled more cleanly with more appropriate warnings.

* [#272](https://github.com/cloudflare/wrangler2/pull/272) [`5fcef05`](https://github.com/cloudflare/wrangler2/commit/5fcef05bbd8d046e29bbf61ab6aa84906ff077e1) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: enable TypeScript strict-null checks

  The codebase is now strict-null compliant and the CI checks will fail if a PR tries to introduce code that is not.

- [#277](https://github.com/cloudflare/wrangler2/pull/277) [`6cc9dde`](https://github.com/cloudflare/wrangler2/commit/6cc9dde6665978f5d6435b7d6d56d41d718693c5) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: align publishing sites asset keys with Wrangler 1

  - Use the same hashing strategy for asset keys (xxhash64)
  - Include the full path (from cwd) in the asset key
  - Match include and exclude patterns against full path (from cwd)
  - Validate that the asset key is not over 512 bytes long

* [#270](https://github.com/cloudflare/wrangler2/pull/270) [`522d1a6`](https://github.com/cloudflare/wrangler2/commit/522d1a6e4ec12d15148c48549dd074628cfd6824) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: check actual asset file size, not base64 encoded size

  Previously we were checking whether the base64 encoded size of an asset was too large (>25MiB).
  But base64 takes up more space than a normal file, so this was too aggressive.

- [#263](https://github.com/cloudflare/wrangler2/pull/263) [`402c77d`](https://github.com/cloudflare/wrangler2/commit/402c77d6be1dc7e797afb20893d2862c96f0343a) Thanks [@jkriss](https://github.com/jkriss)! - fix: appropriately fail silently when the open browser command doesn't work

* [#280](https://github.com/cloudflare/wrangler2/pull/280) [`f19dde1`](https://github.com/cloudflare/wrangler2/commit/f19dde1a7e71d13e9c249345b7affd1cfef79b2c) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: skip unwanted files and directories when publishing site assets

  In keeping with Wrangler 1, we now skip node_modules and hidden files and directories.

  An exception is made for `.well-known`. See https://datatracker.ietf.org/doc/html/rfc8615.

  The tests also prove that the asset uploader will walk directories in general.

- [#258](https://github.com/cloudflare/wrangler2/pull/258) [`ba6fc9c`](https://github.com/cloudflare/wrangler2/commit/ba6fc9c6ddbf3f5b7238f34087bc9533cdba2a5e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - chore: add test-watch script to the wrangler workspace

  Watch the files in the wrangler workspace, and run the tests when anything changes:

  ```sh
  > npm run test-watch -w wrangler
  ```

  This will also run all the tests in a single process (rather than in parallel shards) and will increase the test-timeout to 50 seconds, which is helpful when debugging.

## 0.0.10

### Patch Changes

- [#264](https://github.com/cloudflare/wrangler2/pull/264) [`de73fa2`](https://github.com/cloudflare/wrangler2/commit/de73fa2346737fb159910ac7a2d121671f9c4ea8) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to [`2.2.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.2.0)

## 0.0.9

### Patch Changes

- [#243](https://github.com/cloudflare/wrangler2/pull/243) [`dc7ce83`](https://github.com/cloudflare/wrangler2/commit/dc7ce831a29a69d8171ade84474c84f660667190) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: update test code to pass strict-null checks

* [#244](https://github.com/cloudflare/wrangler2/pull/244) [`2e7a75f`](https://github.com/cloudflare/wrangler2/commit/2e7a75f1bdd48514287a568ea7f802d7dbdf552e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: update dev and publish commands to pass strict-null checks

- [#246](https://github.com/cloudflare/wrangler2/pull/246) [`e6733a3`](https://github.com/cloudflare/wrangler2/commit/e6733a3abf2be1c7a6c18b65b412ccc8501fd3ba) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: upgrade `miniflare` to [`2.1.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.1.0)

* [#238](https://github.com/cloudflare/wrangler2/pull/238) [`65f9904`](https://github.com/cloudflare/wrangler2/commit/65f9904936a11dad8fef599242e0590bb5b7431a) Thanks [@threepointone](https://github.com/threepointone)! - refactor: simplify and document `config.ts`

  This PR cleans up the type definition for the configuration object, as well as commenting the hell out of it. There are no duplicate definitions, and I annotated what I could.

  - `@optional` means providing a value isn't mandatory
  - `@deprecated` means the field itself isn't necessary anymore in wrangler.toml
  - `@breaking` means the deprecation/optionality is a breaking change from wrangler 1
  - `@todo` means there's more work to be done (with details attached)
  - `@inherited` means the field is copied to all environments

- [#247](https://github.com/cloudflare/wrangler2/pull/247) [`edc4b53`](https://github.com/cloudflare/wrangler2/commit/edc4b53c206373cb00470069f72846b56eb28427) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: update miscellaneous source files to pass strict-null checks

* [#248](https://github.com/cloudflare/wrangler2/pull/248) [`5806932`](https://github.com/cloudflare/wrangler2/commit/580693282f2c4c459add276143e53edfd057c677) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: update proxy code to pass strict-null checks

- [#241](https://github.com/cloudflare/wrangler2/pull/241) [`5d423e9`](https://github.com/cloudflare/wrangler2/commit/5d423e97136e9e9a1dfcc95d78f2b3a8ba56fd3f) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - chore: add common words to the cSpell config to prevent unwanted warnings

* [#257](https://github.com/cloudflare/wrangler2/pull/257) [`00e51cd`](https://github.com/cloudflare/wrangler2/commit/00e51cd5106dddd2af1c7cb99a6478e4fa3b276b) Thanks [@threepointone](https://github.com/threepointone)! - fix: description for `kv:bulk delete <filename>`

  The description for the `kv:bulk delete` command was wrong, it was probably copied earlier from the `kv:bulk put` command. This PR fixes the mistake.

- [#262](https://github.com/cloudflare/wrangler2/pull/262) [`7494cf7`](https://github.com/cloudflare/wrangler2/commit/7494cf7c18aa9f4454aca75f4d126d2ec976e736) Thanks [@threepointone](https://github.com/threepointone)! - fix: fix `dev` and `publish`

  We introduced some bugs in recent PRs

  - In https://github.com/cloudflare/wrangler2/pull/196, we broke being able to pass an entrypoint directly to the cli. In this PR, I just reverted that fix. I'll reopen https://github.com/cloudflare/wrangler2/issues/78 and we'll tackle it again later. (cc @jgentes)
  - In https://github.com/cloudflare/wrangler2/pull/215, we broke being able to publish a script by just passing `--latest` or `--compatibility-data` in the cli. This PR fixes that by reading the correct argument when choosing whether to publish.
  - In https://github.com/cloudflare/wrangler2/pull/247, we broke how we made requests by passing headers to requests. This PR reverts the changes made in `cfetch/internal.ts`. (cc @petebacondarwin)
  - In https://github.com/cloudflare/wrangler2/pull/244, we broke `dev` and it would immediately crash. This PR fixes the reference in `dev.tsx` that was breaking. (cc @petebacondarwin)

* [#250](https://github.com/cloudflare/wrangler2/pull/250) [`3c74a4a`](https://github.com/cloudflare/wrangler2/commit/3c74a4a31d4c49c2d4221f59475337d81d26f0b7) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: update inspector code to ensure that strict-null types pass

## 0.0.8

### Patch Changes

- [#231](https://github.com/cloudflare/wrangler2/pull/231) [`18f8f65`](https://github.com/cloudflare/wrangler2/commit/18f8f65424adb8505c7584ae01b1823bb648eb6e) Thanks [@threepointone](https://github.com/threepointone)! - refactor: proxy/preview server

  This PR refactors how we setup the proxy server between the developer and the edge preview service during `wrangler dev`. Of note, we start the server immediately. We also buffer requests/streams and hold on to them, when starting/refreshing the token. This means a developer should never see `ERR_CONNECTION_REFUSED` error page, or have an older worker respond after making a change to the code. And when the token does get refreshed, we flush said streams/requests with the newer values, making the iteration process a lot smoother and predictable.

* [#239](https://github.com/cloudflare/wrangler2/pull/239) [`0431093`](https://github.com/cloudflare/wrangler2/commit/04310932118921d4566ccf6c803b9980dc986089) Thanks [@Warfields](https://github.com/Warfields)! - Added prompt for users to select an account.

- [#225](https://github.com/cloudflare/wrangler2/pull/225) [`b901bf7`](https://github.com/cloudflare/wrangler2/commit/b901bf76dee2220fb0349fca8d9250ea8e09fdb4) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Fix the `--watch` command for `wrangler pages functions build`.

* [#208](https://github.com/cloudflare/wrangler2/pull/208) [`fe4b099`](https://github.com/cloudflare/wrangler2/commit/fe4b0996eb446a94896fac4c7a4210ea5db52f11) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Remove explicit `any` types from the codebase

  This change removes all use of `any` from the code and updates the `no-explicit-any` eslint rule to be an error.

- [#223](https://github.com/cloudflare/wrangler2/pull/223) [`a979d55`](https://github.com/cloudflare/wrangler2/commit/a979d55feac1bdd340ec2b56710691837399183d) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Add ability to compile a directory other than `functions` for `wrangler pages functions build`.

* [#216](https://github.com/cloudflare/wrangler2/pull/216) [`e1c615f`](https://github.com/cloudflare/wrangler2/commit/e1c615f4e04c8d9d2dfa31fc0c5278d97c5dd663) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Ignore non-JS files when compiling Pages Functions

- [#217](https://github.com/cloudflare/wrangler2/pull/217) [`777f4d5`](https://github.com/cloudflare/wrangler2/commit/777f4d581a252f4b7f760816a00c3e8ae7b5a463) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Reverse execution order of Pages Functions middlewares

* [#221](https://github.com/cloudflare/wrangler2/pull/221) [`8ff5537`](https://github.com/cloudflare/wrangler2/commit/8ff55376ffb8f9db24d56fef6ee2c6bd5cc0527d) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to `2.0.0`

- [#196](https://github.com/cloudflare/wrangler2/pull/196) [`fc112d7`](https://github.com/cloudflare/wrangler2/commit/fc112d74fe212f32e585865df96999a894062801) Thanks [@jgentes](https://github.com/jgentes)! - allow specifying only "index" without extension or nothing at all for "wrangler dev" and "wrangler publish"

* [#211](https://github.com/cloudflare/wrangler2/pull/211) [`3bbfd4f`](https://github.com/cloudflare/wrangler2/commit/3bbfd4f7c207eb7dc903b843a53589d2fc3dea87) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Silently fail to auto-open the browser in `wrangler pages dev` command when that errors out.

- [#189](https://github.com/cloudflare/wrangler2/pull/189) [`2f7e1b2`](https://github.com/cloudflare/wrangler2/commit/2f7e1b21d229ea942bb0ee7dd46de3446576c604) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Refactor raw value extraction from Cloudflare APIs

  Most API responses are JSON of the form:

  ```
  { result, success, errors, messages, result_info }
  ```

  where the `result` contains the actual response value.

  But some API responses only contain the result value.

  This change refactors the client-side fetch API to allow callers to specify what kind of response they expect.

* [#202](https://github.com/cloudflare/wrangler2/pull/202) [`e26781f`](https://github.com/cloudflare/wrangler2/commit/e26781f9089b02425af56b8a7fe5c6770a457ffe) Thanks [@threepointone](https://github.com/threepointone)! - Disable @typescript-lint/no-explicit-any eslint rule in pages code

- [#214](https://github.com/cloudflare/wrangler2/pull/214) [`79d0f2d`](https://github.com/cloudflare/wrangler2/commit/79d0f2dc8ab416c15c5b1e73b6c6888ade8c848a) Thanks [@threepointone](https://github.com/threepointone)! - rename `--public` as `--experimental-public`

* [#215](https://github.com/cloudflare/wrangler2/pull/215) [`41d4c3e`](https://github.com/cloudflare/wrangler2/commit/41d4c3e0ae24f3edbe1ee510ec817f6aca528e6e) Thanks [@threepointone](https://github.com/threepointone)! - Add `--compatibility-date`, `--compatibility-flags`, `--latest` cli arguments to `dev` and `publish`.

  - A cli arg for adding a compatibility data, e.g `--compatibility_date 2022-01-05`
  - A shorthand `--latest` that sets `compatibility_date` to today's date. Usage of this flag logs a warning.
  - `latest` is NOT a config field in `wrangler.toml`.
  - In `dev`, when a compatibility date is not available in either `wrangler.toml` or as a cli arg, then we default to `--latest`.
  - In `publish` we error if a compatibility date is not available in either `wrangler.toml` or as a cli arg. Usage of `--latest` logs a warning.
  - We also accept compatibility flags via the cli, e.g: `--compatibility-flags formdata_parser_supports_files`

- [#210](https://github.com/cloudflare/wrangler2/pull/210) [`d381fed`](https://github.com/cloudflare/wrangler2/commit/d381fed8ff6c5450d0b2ed5a636e99bb874a5a3a) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Expose `wrangler pages functions build` command, which takes the `functions` folder and compiles it into a single Worker.

  This was already done in `wrangler pages dev`, so this change just exposes this build command for use in our build image, or for people who want to do it themselves.

* [#213](https://github.com/cloudflare/wrangler2/pull/213) [`5e1222a`](https://github.com/cloudflare/wrangler2/commit/5e1222a827792fbd4a7a48c73eedde5ffa476cf5) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Adds support for building a Worker from a folder of functions which isn't tied to the Pages platform.

  This lets developers use the same file-based routing system an simplified syntax when developing their own Workers!

- [#199](https://github.com/cloudflare/wrangler2/pull/199) [`d9ecb70`](https://github.com/cloudflare/wrangler2/commit/d9ecb7070ac692550497c8dfb3627e7badae4438) Thanks [@threepointone](https://github.com/threepointone)! - Refactor inspection/debugging code -

  - I've installed devtools-protocol, a convenient package that has the static types for the devtools protocol (duh) autogenerated from chrome's devtools codebase.
  - We now log messages and exceptions into the terminal directly, so you don't have to open devtools to see those messages.
  - Messages are now buffered until a devtools instance connects, so you won't lose any messages while devtools isn't connected.
  - We don't lose the connection on making changes to the worker, removing the need for the kludgy hack on the devtools side (where we refresh the whole page when there's a change)

* [#189](https://github.com/cloudflare/wrangler2/pull/189) [`2f7e1b2`](https://github.com/cloudflare/wrangler2/commit/2f7e1b21d229ea942bb0ee7dd46de3446576c604) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Fix pagination handling of list requests to the Cloudflare API

  When doing a list request to the API, the server may respond with only a single page of results.
  In this case, it will also provide a `cursor` value in the `result_info` part of the response, which can be used to request the next page.
  This change implements this on the client-side so that we get all the results by requesting further pages when there is a cursor.

- [#220](https://github.com/cloudflare/wrangler2/pull/220) [`6fc2276`](https://github.com/cloudflare/wrangler2/commit/6fc2276e9515da22fe05f267dc9cfef22b2f2793) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Add `--live-reload` option to `wrangler pages dev` which automatically reloads HTML pages when a change is detected

* [#223](https://github.com/cloudflare/wrangler2/pull/223) [`a979d55`](https://github.com/cloudflare/wrangler2/commit/a979d55feac1bdd340ec2b56710691837399183d) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Add `--output-config-path` option to `wrangler pages functions build` which writes a config file describing the `functions` folder.

## 0.0.7

### Patch Changes

- 1fdcfe3: Subfolder Relative Pathing Fix issue #147
  The filename from args didn't handle relative paths passed in from users with scripts in subfolders.
  To handle the subfolder pathing a path.relative using cwd() to user input filepath to the filepath variable passed into Dev
- 0330ecf: Adds the Content-Type header when serving assets with `wrangler pages dev`. It guesses the mime-type based on the asset's file extension.
- eaf40e8: Improve the error message for bad `kv:namespace delete` commands
- 562d3ad: chore: enable eslint's no-shadow rule
- 9cef492: Adds the logic of @cloudflare/pages-functions-compiler directly into wrangler. This generates a Worker from a folder of functions.

  Also adds support for sourcemaps and automatically watching dependents to trigger a re-build.

- 3426c13: fix: prevent `useWorker`'s inifinite restarts during `dev`
- e9a1820: Upgrade `miniflare` to `2.0.0-rc.5`
- 7156e39: Pass bindings correctly to miniflare/child_process.spawn in `dev`, to prevent miniflare from erroring out on startup
- ce2d7d1: Add experimental support for worker-to-worker service bindings. This introduces a new field in configuration `experimental_services`, and serialises it when creating and uploading a worker definition. This is highly experimental, and doesn't work with `wrangler dev` yet.
- 072566f: Fixed KV getNamespaceId preview flag bug
- 5856807: Improve validation message for `kv:namespace create`

  Previously, if the user passed multiple positional arguments (which is invalid)
  the error message would suggest that these should be grouped in quotes.
  But this is also wrong, since a namespace binding name must not contain spaces.

- 34ad323: Refactor the way we convert configurations for bindings all the way through to the API where we upload a worker definition. This commit preserves the configuration structure (mostly) until the point we serialise it for the API. This prevents the way we use duck typing to detect a binding type when uploading, makes the types a bit simpler, and makes it easier to add other types of bindings in the future (notably, the upcoming service bindings.)

## 0.0.6

### Patch Changes

- 421f2e4: Update base version to 0.0.5, copy the README to packages/wrangler

## 0.0.5

### Patch Changes

- cea27fe: don't log file contents when writing via `kv:key put <key> --path <path>`
- b53cbc8: CI/CD
  - Release flow triggered on PR's closed
- 43e7a82: When using `wrangler pages dev`, enable source maps and log unhandled rejections
- c716abc: Error and exit if the `--type` option is used for the `init` command.

  The `--type` option is no longer needed, nor supported.

  The type of a project is implicitly javascript, even if it includes a wasm (e.g. built from rust).

  Projects that would have had the `webpack` type need to be configured separately to have a custom build.

- 3752acf: Add support for websockets in `dev`, i.e. when developing workers. This replaces the proxy layer that we use to connect to the 'edge' during preview mode, using the `faye-wesocket` library.
- c7bee70: Patches typing mismatches between us, undici and miniflare when proxying requests in pages dev, and also adds fallback 404 behavior which was missed
- 8b6c2d1: Add more fields to the `tsconfig.json` generated by `wrangler init`
- 78cd080: Custom builds for `dev` and `publish`
- cd05d20: import text file types into workers
- 1216fc9: Export regular functions from dialog.ts, pass tests (followup from https://github.com/cloudflare/wrangler2/pull/124)
- 6fc4c50: Display error message when unknown command is provided to the wrangler CLI.
- 23543fe: Allow the developer to exit `init` if there is already a toml file
- 1df6b0c: enable @typescript-eslint/no-floating-promises, pass lint+type check
- 3c5725f: CI/CD Cleanup
  - Removed the build step from tests, which should speed up the "Tests" Workflow.
  - Added a branch specific trigger for "Release", now the Workflow for "Release" should only work on PRs closed to `main`
  - Removed the "Changeset PR" Workflow. Now the "Release" Workflow will handle everything needed for Changesets.
- fb0eae7: support importing `.wasm` files / `workers-rs` support
- e928f94: Improve support for package exports conditionals, including "worker" condition
- 43e7a82: Upgrade `miniflare` to `2.0.0-rc.4`
- f473942: Replaces the static asset server with a more faithful simulation of what happens with a production Pages project.

  Also improves error handling and automatically opens the browser when running `wrangler pages dev`.

## 0.0.0

### Minor Changes

- 689cd55: CI/CD Improvements

  ## Changeset

  Adding configuration allows for use of CLI for changesets. A necessary supplement to the changesets bot, and GitHub Action.

  - Installed Changeset CLI tool
  - NPX changeset init
    - Added changesets directory
    - Config
    - README
  - Modified the config for `main` branch instead of `master`

  ## ESLint & Prettier Integration

  Running Prettier as a rule through ESLint to improve CI/CD usage

  - Added additional TypeScript support for ESLint
  - Prettier errors as ESLint rule
  - .vscode directory w/ settings.json config added that enforces
    the usage of ESLint by anyone working in the workspace

### Patch Changes

- b0fcc7d: CI/CD Tests & Type Checking
  GH Workflow additions:

  - Added Testing script
  - Added Linting script
  - tsc is using skipLibCheck as a current workaround
    - TODO added for future removal
  - Runs on every Pull Request instance
  - Removed npm ci in favor of npm install
    - Removed --prefer-offline in favor of local cache artifact

- 2f760f5: remove `--polyfill-node`
- fd53780: `kv:key put`: make only one of `value` or `--path <path>` necessary
- dc41476: Added optional shortcuts
- 7858ca2: Removed NPM registry and timeout from CI
- 85b5020: Make `wrangler dev` work with durable objects
