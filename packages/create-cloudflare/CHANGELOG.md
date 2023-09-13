# create-cloudflare

## 2.2.3

### Patch Changes

- [#3935](https://github.com/cloudflare/workers-sdk/pull/3935) [`bdb39edc`](https://github.com/cloudflare/workers-sdk/commit/bdb39edc4d072309794786c79005bdd59559053d) Thanks [@IgorMinar](https://github.com/IgorMinar)! - fix: remove unused env variable from sveltekit project template

## 2.2.2

### Patch Changes

- [#3880](https://github.com/cloudflare/workers-sdk/pull/3880) [`c6c435eb`](https://github.com/cloudflare/workers-sdk/commit/c6c435ebe8984590b1800ac7acf4fec9f7538373) Thanks [@admah](https://github.com/admah)! - Update Worker templates from worker.{ts,js} to index.{ts,js} to better align with docs and examples

## 2.2.1

### Patch Changes

- [#3841](https://github.com/cloudflare/workers-sdk/pull/3841) [`81c45b98`](https://github.com/cloudflare/workers-sdk/commit/81c45b988a2f772279bc5f37dba6b8cb83afef36) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Fail and display the help message if an unrecognized argument is passed to C3

## 2.2.0

### Minor Changes

- [#3776](https://github.com/cloudflare/workers-sdk/pull/3776) [`83e526b3`](https://github.com/cloudflare/workers-sdk/commit/83e526b3c9ea53b8cfbba5ab222613bf21c1db79) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add final commit when generating Pages projects

  before after the user would have completed the creation of a Pages project
  they would find the Cloudflare added/modified files uncommitted, instead of
  leaving these uncommitted this change adds an extra commit (on top of the
  framework specific) which also contains some useful information about the
  project

* [#3803](https://github.com/cloudflare/workers-sdk/pull/3803) [`9156994e`](https://github.com/cloudflare/workers-sdk/commit/9156994e1b1dccccc0dde8b6eba01a5a241f9511) Thanks [@jculvey](https://github.com/jculvey)! - C3: Checks for a newer version of create-cloudflare and uses it if available. This behavior can be suppressed with the --no-auto-update flag.

### Patch Changes

- [#3807](https://github.com/cloudflare/workers-sdk/pull/3807) [`fac199ba`](https://github.com/cloudflare/workers-sdk/commit/fac199ba0c3bee758ac13fa8e6133c19f4af845d) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - adjusted arguments passing so that arguments following an extra `--` are
  passed to the underlying cli (if any)

  For example:

  ```
  $ npm create cloudflare -- --framework=X -- -a -b
  ```

  now will run the framework X's cli with the `-a` and `-b` arguments
  (such arguments will be completely ignored by C3)

* [#3822](https://github.com/cloudflare/workers-sdk/pull/3822) [`3db34519`](https://github.com/cloudflare/workers-sdk/commit/3db3451988988c0af82023cc53975bbaef14ac8a) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - update the frameworks' cli versions used in C3

  - `@angular/cli` from 16.1.x to 16.2.0
  - `create-next-app` from 13.4.2 to 13.4.19
  - `create-remix` from 1.16.0 to 1.19.3
  - `gatsby` from 5.10.0 to 5.11.0
  - `nuxi` from 3.4.2 to 3.6.5

## 2.1.1

### Patch Changes

- [#3729](https://github.com/cloudflare/workers-sdk/pull/3729) [`9d8509e0`](https://github.com/cloudflare/workers-sdk/commit/9d8509e08acf082604ca896b4ab9ad5c05ae7505) Thanks [@jculvey](https://github.com/jculvey)! - Improve experience for WARP users by improving the reliability of the polling logic that waits for newly created apps to become available.

* [#3552](https://github.com/cloudflare/workers-sdk/pull/3552) [`77a43d2a`](https://github.com/cloudflare/workers-sdk/commit/77a43d2aa3633fc53be6fe365271d6fb59f44bd6) Thanks [@yusukebe](https://github.com/yusukebe)! - fix: use workers template for Hono

  Use a workers template instead of a pages template for `create-hono`.

## 2.1.0

### Minor Changes

- [#3604](https://github.com/cloudflare/workers-sdk/pull/3604) [`c3ff1c2b`](https://github.com/cloudflare/workers-sdk/commit/c3ff1c2b599c99f4915dad0362c7570cc2fa2bf3) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Add the option to add the `eslint-plugin-next-on-pages` eslint plugin
  to developers creating a new Next.js app with eslint enabled

## 2.0.14

### Patch Changes

- [#3644](https://github.com/cloudflare/workers-sdk/pull/3644) [`775eb3bd`](https://github.com/cloudflare/workers-sdk/commit/775eb3bd32611d339ec4071c3d523d1d15bc7e30) Thanks [@jculvey](https://github.com/jculvey)! - Detect production branch when creating pages project

* [#3600](https://github.com/cloudflare/workers-sdk/pull/3600) [`3f7d6e7d`](https://github.com/cloudflare/workers-sdk/commit/3f7d6e7d654ea8958c6c2e0e78da4c5e4a78d2d5) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - improve the Nuxt deployment script so that it ships full stack applications (instead of server-side generated ones)

  as part of this change update the Nuxt build script to include the `NITRO_PRESET` env variable set to `cloudflare-pages` (needed to build Pages compatible applications)

  also write a .node-version file with the node version (so that it can properly working with the Pages CI)

## 2.0.13

### Patch Changes

- [#3609](https://github.com/cloudflare/workers-sdk/pull/3609) [`be3a43ff`](https://github.com/cloudflare/workers-sdk/commit/be3a43ff9d96785e379e8e6bcb72b332519216b0) Thanks [@admah](https://github.com/admah)! - Removes all typescript dependencies from javascript templates.

* [#3601](https://github.com/cloudflare/workers-sdk/pull/3601) [`e4ef867c`](https://github.com/cloudflare/workers-sdk/commit/e4ef867cc973d89eeee336ac4c4af62f905ae765) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - remove extra build added by mistake in solid deploy script

## 2.0.12

### Patch Changes

- [#3525](https://github.com/cloudflare/workers-sdk/pull/3525) [`1ce32968`](https://github.com/cloudflare/workers-sdk/commit/1ce32968b990fef59953b8cd61172b98fb2386e5) Thanks [@jculvey](https://github.com/jculvey)! - C3: Infer missing --type argument from --framework or --existing-script

* [#3580](https://github.com/cloudflare/workers-sdk/pull/3580) [`a7c1dd5b`](https://github.com/cloudflare/workers-sdk/commit/a7c1dd5b6c3a84b5ee4767935a2ca1820d28528e) Thanks [@jculvey](https://github.com/jculvey)! - C3: Prompt user to change directory in summary steps

- [#3551](https://github.com/cloudflare/workers-sdk/pull/3551) [`137e174d`](https://github.com/cloudflare/workers-sdk/commit/137e174d79e7c5779c24de904d3cd958587a87c7) Thanks [@yusukebe](https://github.com/yusukebe)! - fix: bump up `create-hono` version

  Bump up `create-hono` version to latest v0.2.6 for C3.

## 2.0.11

### Patch Changes

- [#3465](https://github.com/cloudflare/workers-sdk/pull/3465) [`528cc0fc`](https://github.com/cloudflare/workers-sdk/commit/528cc0fc583e9672247d5934c8b33afebbb834e7) Thanks [@jculvey](https://github.com/jculvey)! - Improvements to the project name selection prompt.

* [#3500](https://github.com/cloudflare/workers-sdk/pull/3500) [`c43fc4e8`](https://github.com/cloudflare/workers-sdk/commit/c43fc4e826eeca8a92c6749485eb3b8b47c4a818) Thanks [@jculvey](https://github.com/jculvey)! - Fix the output of the --version flag

- [#3343](https://github.com/cloudflare/workers-sdk/pull/3343) [`cc9ced83`](https://github.com/cloudflare/workers-sdk/commit/cc9ced83bc9f996b0380d46859990780e574884c) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: use a valid compatibility date for worker templates

  Previously, we changed wrangler.toml to use the current date for the
  compatibility_date setting in wrangler.toml when generating workers.
  But this is almost always going to be too recent and results in a warning.

  Now we look up the most recent compatibility date via npm on the workerd
  package and use that instead.

  Fixes https://github.com/cloudflare/workers-sdk/issues/2385

* [#3516](https://github.com/cloudflare/workers-sdk/pull/3516) [`941764d0`](https://github.com/cloudflare/workers-sdk/commit/941764d0a2003ec8108ba75efe25978b000f637c) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure the Angular fetch handler returns a "real" promise to Cloudflare

  Angular employs the Zone.js library to patch potentially async operations so that
  it can trigger change detection reliably. But in order to do this, it swaps out
  the native `Promise` with a `ZoneAwarePromise` class.

  The Cloudflare runtime (i.e. workerd) does runtime checks on the value returned
  from the `fetch()` handler, expecting it to be a native `Promise` and fails if not.

  This fix ensures that the actual object returned from the `fetch()` is actually a
  native `Promise`. We don't need to stop Angular using `ZoneAwarePromises` elsewhere.

- [#3486](https://github.com/cloudflare/workers-sdk/pull/3486) [`436f752d`](https://github.com/cloudflare/workers-sdk/commit/436f752d77b12b81d91341185fc9229f25571a69) Thanks [@Cherry](https://github.com/Cherry)! - fix: use wrangler deploy command for deploying applications instead of the deprecated wrangler publish

## 2.0.10

### Patch Changes

- [#3345](https://github.com/cloudflare/workers-sdk/pull/3345) [`42f7eb81`](https://github.com/cloudflare/workers-sdk/commit/42f7eb815ea273ab6370dadf423c0cf79cc20aa8) Thanks [@jculvey](https://github.com/jculvey)! - Use `pnpm dlx` instead of `pnpx` for versions of pnpm that support it

* [#3435](https://github.com/cloudflare/workers-sdk/pull/3435) [`23be8025`](https://github.com/cloudflare/workers-sdk/commit/23be8025f5812f12a69270d44deff60f4bd33ae0) Thanks [@sdnts](https://github.com/sdnts)! - Updated wrangler.toml for Workers projects generated by create-cloudflare

- [#3496](https://github.com/cloudflare/workers-sdk/pull/3496) [`91135e02`](https://github.com/cloudflare/workers-sdk/commit/91135e02cc97d11a6762c05e788c705697c477cb) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure that default project name can be used

  If you hit enter when asked for the name of the project, you expect it
  to use the default value. But the project name validation was then failing
  as it was receiving undefined for the value of the input rather than the
  default value.

  Now the validator will be passed the default if no value was provided.

* [#3474](https://github.com/cloudflare/workers-sdk/pull/3474) [`a72dc0a1`](https://github.com/cloudflare/workers-sdk/commit/a72dc0a16577558e599ea9ced7fa39cd952c2b78) Thanks [@elithrar](https://github.com/elithrar)! - Add new Queues and Scheduled (Cron Trigger) Worker templates.

- [#3446](https://github.com/cloudflare/workers-sdk/pull/3446) [`ca0bd174`](https://github.com/cloudflare/workers-sdk/commit/ca0bd174c4e56e0d33c88c0b9bdba9489b2c78eb) Thanks [@admah](https://github.com/admah)! - refactor: rename `simple` template to `hello-world` in create-cloudflare package

  This change describes the "hello-world" template more accurately.
  Also, new e2e tests have been added to validate that Workers templates are created correctly.

* [#3359](https://github.com/cloudflare/workers-sdk/pull/3359) [`5eef992f`](https://github.com/cloudflare/workers-sdk/commit/5eef992f2c9f71a4c9d5e0cc2820aad24b7ef382) Thanks [@RamIdeas](https://github.com/RamIdeas)! - `wrangler init ... -y` now delegates to C3 without prompts (respects the `-y` flag)

## 2.0.9

### Patch Changes

- [#3245](https://github.com/cloudflare/workers-sdk/pull/3245) [`4082cfcb`](https://github.com/cloudflare/workers-sdk/commit/4082cfcbdf08740d4a608d3d87df22e51ad0ce4a) Thanks [@james-elicx](https://github.com/james-elicx)! - Support for setting compatibility flags for each framework when creating a new pages project.

* [#3295](https://github.com/cloudflare/workers-sdk/pull/3295) [`2dc55daf`](https://github.com/cloudflare/workers-sdk/commit/2dc55dafaac1d42a6ec5a2cd90942f9a168b9f40) Thanks [@Cherry](https://github.com/Cherry)! - fix: use tabs by default in prettier configs

- [#3245](https://github.com/cloudflare/workers-sdk/pull/3245) [`4082cfcb`](https://github.com/cloudflare/workers-sdk/commit/4082cfcbdf08740d4a608d3d87df22e51ad0ce4a) Thanks [@james-elicx](https://github.com/james-elicx)! - Fix support for creating API route handlers in the Next.js template when using the app directory.

## 2.0.8

### Patch Changes

- [#3260](https://github.com/cloudflare/workers-sdk/pull/3260) [`7249f344`](https://github.com/cloudflare/workers-sdk/commit/7249f344109fe1a8f67859e9aff227c7951bc6b9) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add polling for deployed Pages projects

  When create-cloudflare deploys to Pages, it can take a while before the website is ready to be viewed.
  This change adds back in polling of the site and then opening a browser when the URL is ready.

* [#3272](https://github.com/cloudflare/workers-sdk/pull/3272) [`57f80551`](https://github.com/cloudflare/workers-sdk/commit/57f80551961c2f67bf057591518d573f71a51c8f) Thanks [@markdalgleish](https://github.com/markdalgleish)! - Use full Remix template URL rather than the `cloudflare-pages` shorthand since it will be removed in a future version of `create-remix`

- [#3291](https://github.com/cloudflare/workers-sdk/pull/3291) [`c1be44c8`](https://github.com/cloudflare/workers-sdk/commit/c1be44c8ef64f18dbd65a2399e845d3df1d0c1f2) Thanks [@Cherry](https://github.com/Cherry)! - fix: specify correct startup command in logs for newly created c3 projects

## 2.0.7

### Patch Changes

- [#3283](https://github.com/cloudflare/workers-sdk/pull/3283) [`74decfa7`](https://github.com/cloudflare/workers-sdk/commit/74decfa768b7a8ba0f04cf6f437ef075629fb6a7) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: Use correct path to worker source in wrangler.toml of JavaScript simple template

## 2.0.6

### Patch Changes

- [#3273](https://github.com/cloudflare/workers-sdk/pull/3273) [`20479027`](https://github.com/cloudflare/workers-sdk/commit/204790272a813a511837a660d3d3143d8996f641) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: support spawning new processes on Windows

* [#3282](https://github.com/cloudflare/workers-sdk/pull/3282) [`e9210590`](https://github.com/cloudflare/workers-sdk/commit/e9210590d3406fe899170542b67286b2ae299fe9) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure templates are included in deployed package

## 2.0.5

### Patch Changes

- [#3267](https://github.com/cloudflare/workers-sdk/pull/3267) [`186eed94`](https://github.com/cloudflare/workers-sdk/commit/186eed94050d2224eb70799b2d2611d9dba91515) Thanks [@KianNH](https://github.com/KianNH)! - [C3] Fix Worker path in JavaScript template

## 2.0.3

### Patch Changes

- [#3247](https://github.com/cloudflare/workers-sdk/pull/3247) [`db9f0e92`](https://github.com/cloudflare/workers-sdk/commit/db9f0e92b39cfe0377c3c624a84a1db1385afb1a) Thanks [@eneajaho](https://github.com/eneajaho)! - Update versionMap.json to include angular @16.0.x rather than @next

* [#3242](https://github.com/cloudflare/workers-sdk/pull/3242) [`739bd656`](https://github.com/cloudflare/workers-sdk/commit/739bd65624386dcf020c07190e8427b59a9e6229) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: correctly format the compatibility_date field in generated wrangler.toml

  Fixes #3240

- [#3253](https://github.com/cloudflare/workers-sdk/pull/3253) [`7cefb4db`](https://github.com/cloudflare/workers-sdk/commit/7cefb4dbe7d0c6117401fd0e182e112f94f566a7) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - use wrangler@3 as devDep in C3 worker templates

## 2.0.2

### Patch Changes

- [#3238](https://github.com/cloudflare/workers-sdk/pull/3238) [`9973ea29`](https://github.com/cloudflare/workers-sdk/commit/9973ea2953873c1d9d1822dfc35fd04bc321677a) Thanks [@jculvey](https://github.com/jculvey)! - Bumping version of qwik to 1.1.x
