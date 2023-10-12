# create-cloudflare

## 2.5.0

### Minor Changes

- [#4136](https://github.com/cloudflare/workers-sdk/pull/4136) [`0f043a12`](https://github.com/cloudflare/workers-sdk/commit/0f043a126e5499bc1fcfd09782369264e4246317) Thanks [@jculvey](https://github.com/jculvey)! - Fixes an issue that was causing the auto-update check not to run

### Patch Changes

- [#4128](https://github.com/cloudflare/workers-sdk/pull/4128) [`696d7f29`](https://github.com/cloudflare/workers-sdk/commit/696d7f29c6c8cb516164de8da35400ac7bca0694) Thanks [@jculvey](https://github.com/jculvey)! - Verify that project names are valid for pages projects

## 2.4.1

### Patch Changes

- [#4125](https://github.com/cloudflare/workers-sdk/pull/4125) [`d0e8e380`](https://github.com/cloudflare/workers-sdk/commit/d0e8e38035b7d65f99834700426d95dd88d54085) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-qwik` from `1.2.12` to `1.2.13`

* [#4152](https://github.com/cloudflare/workers-sdk/pull/4152) [`acf3b64b`](https://github.com/cloudflare/workers-sdk/commit/acf3b64b4757325ffb9298bfd5ff3cf0b87bcb19) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix incorrect service example in worker template toml files

- [#4119](https://github.com/cloudflare/workers-sdk/pull/4119) [`64c3ec15`](https://github.com/cloudflare/workers-sdk/commit/64c3ec15f71271395982746b173ddb5c17a3de0b) Thanks [@jculvey](https://github.com/jculvey)! - Don't prompt the user to use git if `user.name` and `user.email` haven't been configured

## 2.4.0

### Minor Changes

- [#4063](https://github.com/cloudflare/workers-sdk/pull/4063) [`cb4309f9`](https://github.com/cloudflare/workers-sdk/commit/cb4309f90b433fb7b6f81279878bca11fe2a6937) Thanks [@jculvey](https://github.com/jculvey)! - Bump supported node version to 18.14.1

  We've recently switched out testing infrastructure to test C3 on node version 18.14.1.
  As of earlier this month, Node v16 is no longer supported, and many of the underlying
  framework scaffolding tools that C3 uses (ex. `create-astro`, `gatsby`) have dropped
  support for node v16, which in turn causes C3 to fail for those frameworks.

* [#4065](https://github.com/cloudflare/workers-sdk/pull/4065) [`55298d9f`](https://github.com/cloudflare/workers-sdk/commit/55298d9f3ffc177cc390cd5e9ccc713261933585) Thanks [@jculvey](https://github.com/jculvey)! - Add support for bun

### Patch Changes

- [#3991](https://github.com/cloudflare/workers-sdk/pull/3991) [`80f78dad`](https://github.com/cloudflare/workers-sdk/commit/80f78dad4652cb9c6807c5144c4c32324f0c15e6) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-astro` from `4.1.0` to `4.2.0`

* [#4002](https://github.com/cloudflare/workers-sdk/pull/4002) [`8ee46b06`](https://github.com/cloudflare/workers-sdk/commit/8ee46b063cab7a585074413b2c38a58a4e2f4eff) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-docusaurus` from `2.4.1` to `2.4.3`

- [#4012](https://github.com/cloudflare/workers-sdk/pull/4012) [`a21acf82`](https://github.com/cloudflare/workers-sdk/commit/a21acf8217fa2eff57cffb6753865a37386b5f13) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-solid` from `0.2.26` to `0.3.6`

* [#4091](https://github.com/cloudflare/workers-sdk/pull/4091) [`a9cb8c60`](https://github.com/cloudflare/workers-sdk/commit/a9cb8c608f2594170e92a0f49c3f85def4edf03c) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-svelte` from `5.0.6` to `5.1.0`

- [#4100](https://github.com/cloudflare/workers-sdk/pull/4100) [`866c7833`](https://github.com/cloudflare/workers-sdk/commit/866c7833ec091825a4916bd6dfbcbc04d8c0bafe) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-remix` from `2.0.0` to `2.0.1`

* [#4103](https://github.com/cloudflare/workers-sdk/pull/4103) [`f79cf89a`](https://github.com/cloudflare/workers-sdk/commit/f79cf89aeefb072dde5fc1ada24001af74fa363b) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-astro` from `4.2.0` to `4.2.1`

- [#4088](https://github.com/cloudflare/workers-sdk/pull/4088) [`35165a26`](https://github.com/cloudflare/workers-sdk/commit/35165a26d9e1eda1f049d5a5b5a1cb2cd1e09c9f) Thanks [@jculvey](https://github.com/jculvey)! - Fixes an issue where users were prompted for TypeScript twice during worker creation

* [#4087](https://github.com/cloudflare/workers-sdk/pull/4087) [`57e9f218`](https://github.com/cloudflare/workers-sdk/commit/57e9f218ae3ce11736d4ff6a09e05a6662ce13c5) Thanks [@jculvey](https://github.com/jculvey)! - Fixes an issue where exiting early from c3 would cause the terminal cursor to be hidden

- [#3754](https://github.com/cloudflare/workers-sdk/pull/3754) [`811730d8`](https://github.com/cloudflare/workers-sdk/commit/811730d85066904e5ca9161900577342d59ec851) Thanks [@RamIdeas](https://github.com/RamIdeas)! - .gitignore files were not included in our templates due to npm/npm#3763

  we now workaround this issue and ensure C3 templates include a .gitignore file

* [#4062](https://github.com/cloudflare/workers-sdk/pull/4062) [`02359bc5`](https://github.com/cloudflare/workers-sdk/commit/02359bc50353cbf698de193d56360b6dfc151ad0) Thanks [@jculvey](https://github.com/jculvey)! - Defaults the project type to `Web Framework`. The previous default was `"Hello World" worker`

- [#4030](https://github.com/cloudflare/workers-sdk/pull/4030) [`dba26262`](https://github.com/cloudflare/workers-sdk/commit/dba26262c72b4654c3c0799f975bcd8ff9210082) Thanks [@admah](https://github.com/admah)! - Fixes Workers templates to have a `dev` command in package.json to match comments in `index` files.

* [#3916](https://github.com/cloudflare/workers-sdk/pull/3916) [`15d75e50`](https://github.com/cloudflare/workers-sdk/commit/15d75e50bd9b8ce5837b390f8c2ce39eea446a7e) Thanks [@admah](https://github.com/admah)! - fix: update the main file in the c3 scheduled js template to index.js.

## 2.3.1

### Patch Changes

- [#4001](https://github.com/cloudflare/workers-sdk/pull/4001) [`fd39ae64`](https://github.com/cloudflare/workers-sdk/commit/fd39ae649dc0658de4cfd3eac6dcfc6b4ab6205a) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `nuxi` from `3.8.4` to `3.9.0`

## 2.3.0

### Minor Changes

- [#3887](https://github.com/cloudflare/workers-sdk/pull/3887) [`765ebc1c`](https://github.com/cloudflare/workers-sdk/commit/765ebc1ce293315345c0ccfee808cbc25262b2ed) Thanks [@G4brym](https://github.com/G4brym)! - Add OpenAPI 3.1 template project

* [#3888](https://github.com/cloudflare/workers-sdk/pull/3888) [`7310add1`](https://github.com/cloudflare/workers-sdk/commit/7310add1bb43c72f7b88cce7ed357fa5c11c6f75) Thanks [@G4brym](https://github.com/G4brym)! - Bump chatgptPlugin template itty-router-openapi version

### Patch Changes

- [#3970](https://github.com/cloudflare/workers-sdk/pull/3970) [`0a8d97c7`](https://github.com/cloudflare/workers-sdk/commit/0a8d97c7c6518b7a731197033762b1eeb542d4f7) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-astro` from `4.0.1` to `4.1.0`

* [#3971](https://github.com/cloudflare/workers-sdk/pull/3971) [`1723d3e6`](https://github.com/cloudflare/workers-sdk/commit/1723d3e63f593b909cc253a4415a5e06d8c1162d) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-svelte` from `4.2.0` to `5.0.6`

- [#3972](https://github.com/cloudflare/workers-sdk/pull/3972) [`dac69503`](https://github.com/cloudflare/workers-sdk/commit/dac69503b998d0f3811f06d4e9bdf871865496e4) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-remix` from `1.19.3` to `2.0.0`

* [#3973](https://github.com/cloudflare/workers-sdk/pull/3973) [`324907ac`](https://github.com/cloudflare/workers-sdk/commit/324907acbbc4b82e717681c9d447c9ee2f4f3bfc) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `nuxi` from `3.6.5` to `3.8.4`

- [#3980](https://github.com/cloudflare/workers-sdk/pull/3980) [`1354ab36`](https://github.com/cloudflare/workers-sdk/commit/1354ab365f96b3b16e57d4496014f42bba3c1aa6) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-astro` from `4.0.1` to `4.1.0`

* [#3987](https://github.com/cloudflare/workers-sdk/pull/3987) [`fe227900`](https://github.com/cloudflare/workers-sdk/commit/fe227900955f866def9c3d0dcf51de56a99151ea) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-vue` from `3.6.4` to `3.7.5`

- [#3988](https://github.com/cloudflare/workers-sdk/pull/3988) [`d8833eff`](https://github.com/cloudflare/workers-sdk/commit/d8833eff9779c4d7d0f653666303b8951ef6aaed) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `gatsby` from `5.11.0` to `5.12.4`

* [#3990](https://github.com/cloudflare/workers-sdk/pull/3990) [`07b57803`](https://github.com/cloudflare/workers-sdk/commit/07b57803193232254be5c576ad06dbc7a4407744) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-qwik` from `1.2.7` to `1.2.12`

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
