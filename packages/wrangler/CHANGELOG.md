# wrangler

## 3.114.15

### Patch Changes

- [#9991](https://github.com/cloudflare/workers-sdk/pull/9991) [`3d9b3a0`](https://github.com/cloudflare/workers-sdk/commit/3d9b3a042cd5c0b4c795a5b4c112fc98e09eb30c) Thanks [@workers-devprod](https://github.com/workers-devprod)! - Fix startup profiling when sourcemaps are enabled

## 3.114.14

### Patch Changes

- [#10330](https://github.com/cloudflare/workers-sdk/pull/10330) [`dab7683`](https://github.com/cloudflare/workers-sdk/commit/dab768338918ca3ae19ef6ec432beeb4b11032ed) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Do not attempt to update queue producer settings when deploying a Worker with a queue binding

  Previously, each deployed Worker would update a subset of the queue producer's settings for each queue binding, which could result in broken queue producers or at least conflicts where different Workers tried to set different producer settings on a shared queue.

- [#10233](https://github.com/cloudflare/workers-sdk/pull/10233) [`a00a124`](https://github.com/cloudflare/workers-sdk/commit/a00a1246d478fe8184d1f7249394afa99bcddc72) Thanks [@veggiedefender](https://github.com/veggiedefender)! - Increase the maxBuffer size for capnp uploads

- [#10228](https://github.com/cloudflare/workers-sdk/pull/10228) [`77a4364`](https://github.com/cloudflare/workers-sdk/commit/77a43641c2d5eb7700adb9c3ef7bc3b04eaa3207) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix `NonRetryableError` thrown with an empty error message not stopping workflow retries locally

- Updated dependencies []:
  - miniflare@3.20250718.1

## 3.114.13

### Patch Changes

- [#10015](https://github.com/cloudflare/workers-sdk/pull/10015) [`b5d9bb0`](https://github.com/cloudflare/workers-sdk/commit/b5d9bb026ebfb4c732c3c4999aa5ac0757f1a1b2) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix `wrangler dev` logs being logged on the incorrect level in some cases

  currently the way `wrangler dev` prints logs is faulty, for example the following code

  ```js
  console.error("this is an error");
  console.warn("this is a warning");
  console.debug("this is a debug");
  ```

  inside a worker would cause the following logs:

  ```text
  ✘ [ERROR] this is an error

  ✘ [ERROR] this is a warning

  this is a debug
  ```

  (note that the warning is printed as an error and the debug log is printed even if by default it should not)

  the changes here make sure that the logs are instead logged to their correct level, so for the code about the following will be logged instead:

  ```text
  ✘ [ERROR] this is an error

  ▲ [WARNING] this is a warning
  ```

  (running `wrangler dev` with the `--log-level=debug` flag will also cause the debug log to be included as well)

- [#10187](https://github.com/cloudflare/workers-sdk/pull/10187) [`f480ec7`](https://github.com/cloudflare/workers-sdk/commit/f480ec74d1aaf05681fb8ebabcbcf147cfd6ea8a) Thanks [@workers-devprod](https://github.com/workers-devprod)! - Deleting when Pages project binds to worker requires confirmation

- [#10182](https://github.com/cloudflare/workers-sdk/pull/10182) [`1f686ef`](https://github.com/cloudflare/workers-sdk/commit/1f686ef3d20e2986d1c2d6d554a7fb99004b9924) Thanks [@devin-ai-integration](https://github.com/apps/devin-ai-integration)! - fix: report startup errors before workerd profiling

- [#10226](https://github.com/cloudflare/workers-sdk/pull/10226) [`989e17e`](https://github.com/cloudflare/workers-sdk/commit/989e17e71aeefad3d021a368b57d2f6af6827d1a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Enforce 64-character limit for Workflow binding names locally to match production validation

- [#10216](https://github.com/cloudflare/workers-sdk/pull/10216) [`76d3002`](https://github.com/cloudflare/workers-sdk/commit/76d3002bf7e03f4b5ee255c9fd0eaa81f092311d) Thanks [@devin-ai-integration](https://github.com/apps/devin-ai-integration)! - Add macOS version validation to prevent EPIPE errors on unsupported macOS versions (below 13.5). Miniflare and C3 fail hard while Wrangler shows warnings but continues execution.

- [#10261](https://github.com/cloudflare/workers-sdk/pull/10261) [`8c38b65`](https://github.com/cloudflare/workers-sdk/commit/8c38b65a7fcb424e5674575595c1663b6b363be9) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: strip ANSI escape codes from log files to improve readability and parsing

- [#10171](https://github.com/cloudflare/workers-sdk/pull/10171) [`0d73563`](https://github.com/cloudflare/workers-sdk/commit/0d73563833d47bb61582eb5569b0af74e8f4de1e) Thanks [@devin-ai-integration](https://github.com/apps/devin-ai-integration)! - Handle UTF BOM in config files - detect and remove UTF-8 BOMs, error on unsupported BOMs (UTF-16, UTF-32)

- Updated dependencies [[`b5d9bb0`](https://github.com/cloudflare/workers-sdk/commit/b5d9bb026ebfb4c732c3c4999aa5ac0757f1a1b2), [`76d3002`](https://github.com/cloudflare/workers-sdk/commit/76d3002bf7e03f4b5ee255c9fd0eaa81f092311d)]:
  - miniflare@3.20250718.1

## 3.114.12

### Patch Changes

- [#10019](https://github.com/cloudflare/workers-sdk/pull/10019) [`cce7f6f`](https://github.com/cloudflare/workers-sdk/commit/cce7f6f6c966d43894d57e8adfe05779605b1f65) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - chore: update workerd dependency to latest

- [#10050](https://github.com/cloudflare/workers-sdk/pull/10050) [`ef003a2`](https://github.com/cloudflare/workers-sdk/commit/ef003a2b5dc057575651418e3805521d69251065) Thanks [@emily-shen](https://github.com/emily-shen)! - remove banner from r2 getobject in pipe mode

- [#10003](https://github.com/cloudflare/workers-sdk/pull/10003) [`6940d39`](https://github.com/cloudflare/workers-sdk/commit/6940d39464669e8635e6da710a0449e1204d71be) Thanks [@emily-shen](https://github.com/emily-shen)! - Include more (sanitised) user errors in telemetry.

  We manually vet and sanitised error messages before including them in our telemetry collection - this PR just includes a couple more.

- [#9973](https://github.com/cloudflare/workers-sdk/pull/9973) [`58c09cf`](https://github.com/cloudflare/workers-sdk/commit/58c09cf06e96ebc78d0f5de1b3483285f6a5558c) Thanks [@penalosa](https://github.com/penalosa)! - Make Wrangler warn more loudly if you're missing auth scopes

- Updated dependencies [[`cce7f6f`](https://github.com/cloudflare/workers-sdk/commit/cce7f6f6c966d43894d57e8adfe05779605b1f65), [`028f689`](https://github.com/cloudflare/workers-sdk/commit/028f6896dca78901f5b5a36a938667241d501244)]:
  - miniflare@3.20250718.0

## 3.114.11

### Patch Changes

- [#9685](https://github.com/cloudflare/workers-sdk/pull/9685) [`cbea64b`](https://github.com/cloudflare/workers-sdk/commit/cbea64b37f58301485e632b99749db445e223522) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Select only successfully deployed deployments when tailing.

- [#9776](https://github.com/cloudflare/workers-sdk/pull/9776) [`6e09672`](https://github.com/cloudflare/workers-sdk/commit/6e09672d26f29ebed1b359775b5adafa34a162b5) Thanks [@vicb](https://github.com/vicb)! - Cap the number of errors and warnings for bulk KV put to avoid consuming too much memory

- [#9694](https://github.com/cloudflare/workers-sdk/pull/9694) [`dacfc35`](https://github.com/cloudflare/workers-sdk/commit/dacfc3521da735e8d0d748e5b42ccb826660676c) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add support for assets bindings to `getPlatformProxy`

  this change makes sure that that `getPlatformProxy`, when the input configuration
  file contains an assets field, correctly returns the appropriate asset binding proxy

  example:

  ```jsonc
  // wrangler.jsonc
  {
  	"name": "my-worker",
  	"assets": {
  		"directory": "./public/",
  		"binding": "ASSETS",
  	},
  }
  ```

  ```js
  import { getPlatformProxy } from "wrangler";

  const { env, dispose } = await getPlatformProxy();

  const text = await (await env.ASSETS.fetch("http://0.0.0.0/file.txt")).text();
  console.log(text); // logs the content of file.txt

  await dispose();
  ```

- [#9807](https://github.com/cloudflare/workers-sdk/pull/9807) [`4dd026b`](https://github.com/cloudflare/workers-sdk/commit/4dd026b65a25b61ea8c43e94016946e26a14cbe7) Thanks [@penalosa](https://github.com/penalosa)! - Better messaging for account owned tokens in `wrangler whoami`

## 3.114.10

### Patch Changes

- [#9713](https://github.com/cloudflare/workers-sdk/pull/9713) [`3ff9592`](https://github.com/cloudflare/workers-sdk/commit/3ff95926947ff0a76cf94027ee5c03704e4fede8) Thanks [@penalosa](https://github.com/penalosa)! - Support `wrangler version upload` for Python Workers

- [#9453](https://github.com/cloudflare/workers-sdk/pull/9453) [`0e2949c`](https://github.com/cloudflare/workers-sdk/commit/0e2949c52865163908969fbc98a1f4e7b7575f89) Thanks [@emily-shen](https://github.com/emily-shen)! - Point to the right location for docs on telemetry

- [#9594](https://github.com/cloudflare/workers-sdk/pull/9594) [`0f2f75d`](https://github.com/cloudflare/workers-sdk/commit/0f2f75d6ecf521777321e44d6a1e6e074594ecc4) Thanks [@vicb](https://github.com/vicb)! - drop unused `WRANGLER_UNENV_RESOLVE_PATHS` env var

- [#9631](https://github.com/cloudflare/workers-sdk/pull/9631) [`e101451`](https://github.com/cloudflare/workers-sdk/commit/e101451a29ec341530d2f619baa055034ededc83) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Remove "Cloudchamber" from user facing error messages

## 3.114.9

### Patch Changes

- [#9262](https://github.com/cloudflare/workers-sdk/pull/9262) [`2c3d8dd`](https://github.com/cloudflare/workers-sdk/commit/2c3d8dd3f0d0f1e83605daba9229a86315e6e521) Thanks [@workers-devprod](https://github.com/workers-devprod)! - fix: add no-op `props` to `ctx` in `getPlatformProxy` to fix type mismatch

- [#8681](https://github.com/cloudflare/workers-sdk/pull/8681) [`7a57c14`](https://github.com/cloudflare/workers-sdk/commit/7a57c14cf2a21c81e622d1673979bf665b2fab04) Thanks [@workers-devprod](https://github.com/workers-devprod)! - fix(miniflare): strip CF-Connecting-IP header from all outbound requests

- [#9128](https://github.com/cloudflare/workers-sdk/pull/9128) [`c535845`](https://github.com/cloudflare/workers-sdk/commit/c5358457c93bf6138386f829fd9be60c89ea9867) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: remove outdated js-doc comment for `unstable_startDevWorker`'s `entrypoint`

- [#9259](https://github.com/cloudflare/workers-sdk/pull/9259) [`b742171`](https://github.com/cloudflare/workers-sdk/commit/b742171a2b4cceadba857c63af591e307e99d453) Thanks [@workers-devprod](https://github.com/workers-devprod)! - Relax R2 bucket validation for `pages dev` commands

- [#9172](https://github.com/cloudflare/workers-sdk/pull/9172) [`4e943b1`](https://github.com/cloudflare/workers-sdk/commit/4e943b185a3bec8de67fd9695b048f61d90410d5) Thanks [@vicb](https://github.com/vicb)! - validate r2 bucket names

- [#9250](https://github.com/cloudflare/workers-sdk/pull/9250) [`b2b5ee8`](https://github.com/cloudflare/workers-sdk/commit/b2b5ee8d510fd0c64474f92f932259330bbe4a7d) Thanks [@workers-devprod](https://github.com/workers-devprod)! - fix: strip `CF-Connecting-IP` header within `fetch`

  In v4.15.0, Miniflare began stripping the `CF-Connecting-IP` header via a global outbound service, which led to a TCP connection regression due to a bug in Workerd. This PR patches the `fetch` API to strip the header during local `wrangler dev` sessions as a temporary workaround until the underlying issue is resolved.

- [#9267](https://github.com/cloudflare/workers-sdk/pull/9267) [`8b4f24a`](https://github.com/cloudflare/workers-sdk/commit/8b4f24a6f235f8f654062b2a67fc3777773a3fcd) Thanks [@workers-devprod](https://github.com/workers-devprod)! - fix: setting triggers.crons:[] in Wrangler config should delete deployed cron schedules

- [#9163](https://github.com/cloudflare/workers-sdk/pull/9163) [`d67cd0d`](https://github.com/cloudflare/workers-sdk/commit/d67cd0d8b4861ce9437e40a5e3d4de2b30f2da01) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Do not report "d1 execute" command file missing error to Sentry

- [#8957](https://github.com/cloudflare/workers-sdk/pull/8957) [`9d4ff5b`](https://github.com/cloudflare/workers-sdk/commit/9d4ff5b8e078786f865115b4ac203e035b868b73) Thanks [@workers-devprod](https://github.com/workers-devprod)! - Make sure custom build logging output is more clearly signposted, and make sure it doesn't interfere with the interactive dev session output.

- [#9166](https://github.com/cloudflare/workers-sdk/pull/9166) [`9b4c91d`](https://github.com/cloudflare/workers-sdk/commit/9b4c91dda738a6d6398780e73e455eacb89aa7ab) Thanks [@lambrospetrou](https://github.com/lambrospetrou)! - Fix d1 info command showing read_replication: [object Object]

- Updated dependencies [[`7a57c14`](https://github.com/cloudflare/workers-sdk/commit/7a57c14cf2a21c81e622d1673979bf665b2fab04), [`b2b5ee8`](https://github.com/cloudflare/workers-sdk/commit/b2b5ee8d510fd0c64474f92f932259330bbe4a7d), [`56a0d6e`](https://github.com/cloudflare/workers-sdk/commit/56a0d6e854da5b9b6a0e78c4f49ed325ed75ed52)]:
  - miniflare@3.20250408.2

## 3.114.8

### Patch Changes

- [#9086](https://github.com/cloudflare/workers-sdk/pull/9086) [`a2a56c8`](https://github.com/cloudflare/workers-sdk/commit/a2a56c84bbfa12efa828b03c2292875b0cb09c75) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Do not include .wrangler and Wrangler config files in additional modules

  Previously, if you added modules rules such as `**/*.js` or `**/*.json`, specified `no_bundle: true`, and the entry-point to the Worker was in the project root directory, Wrangler could include files that were not intended, such as `.wrangler/tmp/xxx.js` or the Wrangler config file itself. Now these files are automatically skipped when trying to find additional modules by searching the file tree.

- [#9037](https://github.com/cloudflare/workers-sdk/pull/9037) [`d0d0025`](https://github.com/cloudflare/workers-sdk/commit/d0d0025dd538a7bbc9af2b68f46c55902440d7a2) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: When generating Env types, set type of version metadata binding to `WorkerVersionMetadata`. This means it now correctly includes the `timestamp` field.

- [#9093](https://github.com/cloudflare/workers-sdk/pull/9093) [`2f2f7ba`](https://github.com/cloudflare/workers-sdk/commit/2f2f7ba12eb5c20d81106b40e1f4ed412851b741) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Validate input file for Vectorize inserts

- Updated dependencies [[`fc04292`](https://github.com/cloudflare/workers-sdk/commit/fc042928b06aba7abe466ee2efb83e56f10ebba0), [`a01adca`](https://github.com/cloudflare/workers-sdk/commit/a01adca398c236d91ef87e2c6cbb4432ada2a919)]:
  - miniflare@3.20250408.1

## 3.114.7

### Patch Changes

- [#8955](https://github.com/cloudflare/workers-sdk/pull/8955) [`b7eba92`](https://github.com/cloudflare/workers-sdk/commit/b7eba92da4c8d971d7d025829361468db851e9b9) Thanks [@workers-devprod](https://github.com/workers-devprod)! - When Wrangler encounters an error, if the Bun runtime is detected it will now warn users that Wrangler does not officially support Bun.

- [#8928](https://github.com/cloudflare/workers-sdk/pull/8928) [`8bcb257`](https://github.com/cloudflare/workers-sdk/commit/8bcb257d26e4691e2325987148fd19d4ac1902ae) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix redirected config env validation breaking wrangler pages commands

  a validation check has recently been introduced to make wrangler error on
  deploy commands when an environment is specified and a redirected configuration
  is in use (the reason being that redirected configurations should not include
  any environment), this check is problematic with pages commands where the
  "production" environment is anyways set by default, to address this the validation
  check is being relaxed here on pages commands

## 3.114.6

### Patch Changes

- [#8783](https://github.com/cloudflare/workers-sdk/pull/8783) [`7bcf352`](https://github.com/cloudflare/workers-sdk/commit/7bcf3527684b085effff895383b2c8a96c2d4943) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Improve error message when request to obtain membership info fails

  Wrangler now informs user that specific permission might be not granted when fails to obtain membership info. The same information is provided when Wrangler is unable to fetch user's email.

- [#8866](https://github.com/cloudflare/workers-sdk/pull/8866) [`db673d6`](https://github.com/cloudflare/workers-sdk/commit/db673d67adbd7edb3e08f46784de4e147f0a300b) Thanks [@edmundhung](https://github.com/edmundhung)! - improve error message when redirected config contains environments

  this change improves that validation error message that users see
  when a redirected config file contains environments, by:

  - cleaning the message formatting and displaying the
    offending environments in a list
  - prompting the user to report the issue to the author
    of the tool which has generated the config

- [#8600](https://github.com/cloudflare/workers-sdk/pull/8600) [`91cf028`](https://github.com/cloudflare/workers-sdk/commit/91cf02893e3653db564c58ef079b51d93448978a) Thanks [@workers-devprod](https://github.com/workers-devprod)! - add validation to redirected configs in regards to environments

  add the following validation behaviors to wrangler deploy commands, that relate
  to redirected configs (i.e. config files specified by `.wrangler/deploy/config.json` files):

  - redirected configs are supposed to be already flattened configurations without any
    environment (i.e. a build tool should generate redirected configs already targeting specific
    environments), so if wrangler encounters a redirected config with some environments defined
    it should error
  - given the point above, specifying an environment (`--env=my-env`) when using redirected
    configs is incorrect, so these environments should be ignored and a warning should be
    presented to the user

## 3.114.5

### Patch Changes

- Updated dependencies [[`dec7e2a`](https://github.com/cloudflare/workers-sdk/commit/dec7e2a98f7b3b77bea08c5db27bfa61f8d0656d), [`db2207a`](https://github.com/cloudflare/workers-sdk/commit/db2207ad846a584701a1b7b6afead7c26cf1a664)]:
  - miniflare@3.20250408.0

## 3.114.4

### Patch Changes

- [#8758](https://github.com/cloudflare/workers-sdk/pull/8758) [`04ba075`](https://github.com/cloudflare/workers-sdk/commit/04ba07521872fc69855e00a105302ecaebc016d5) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: return actual error on `wrangler secret bulk`

- [#8703](https://github.com/cloudflare/workers-sdk/pull/8703) [`ef89e6b`](https://github.com/cloudflare/workers-sdk/commit/ef89e6b118196abbf7b1c6d82e6112411e1b3bce) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Improve formatting of cache options for hyperdrive list command

- [#8751](https://github.com/cloudflare/workers-sdk/pull/8751) [`e1ef298`](https://github.com/cloudflare/workers-sdk/commit/e1ef2989f1e13519ec363979f8c230a081efddcc) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: include documentation_url in API Errors if provided

- [#8713](https://github.com/cloudflare/workers-sdk/pull/8713) [`47bf369`](https://github.com/cloudflare/workers-sdk/commit/47bf369ed33ed47253ec59ab13cde0b1cde1b726) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: stop getPlatformProxy crashing when internal DOs are present

  Internal DOs still do not work with getPlatformProxy, but warn instead of crashing.

- [#8683](https://github.com/cloudflare/workers-sdk/pull/8683) [`90d93c9`](https://github.com/cloudflare/workers-sdk/commit/90d93c9ec055f74cae83200d58c0c924fffdf0b1) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Remove `NodeJSCompatModule`. This was never fully supported, and never worked for deploying Workers from Wrangler.

- Updated dependencies [[`90d93c9`](https://github.com/cloudflare/workers-sdk/commit/90d93c9ec055f74cae83200d58c0c924fffdf0b1)]:
  - miniflare@3.20250310.2

## 3.114.3

### Patch Changes

- [#8662](https://github.com/cloudflare/workers-sdk/pull/8662) [`5e57717`](https://github.com/cloudflare/workers-sdk/commit/5e57717a19e9bc294e7de44cc04b998299d264fe) Thanks [@workers-devprod](https://github.com/workers-devprod)! - Amend `pages dev` error message when an environment is requested

- [#8535](https://github.com/cloudflare/workers-sdk/pull/8535) [`6f8e892`](https://github.com/cloudflare/workers-sdk/commit/6f8e89209c2b8013601844a021808b179bc4c1a4) Thanks [@workers-devprod](https://github.com/workers-devprod)! - improve the error messaging when the user provides neither an entry point nor an asset directory

## 3.114.2

### Patch Changes

- [#8453](https://github.com/cloudflare/workers-sdk/pull/8453) [`f90a669`](https://github.com/cloudflare/workers-sdk/commit/f90a6693310ebc04adfd8d7a9665011b0a7dba79) Thanks [@workers-devprod](https://github.com/workers-devprod)! - trigger dummy v3 maintenance release for testing

- [#8500](https://github.com/cloudflare/workers-sdk/pull/8500) [`80bbee3`](https://github.com/cloudflare/workers-sdk/commit/80bbee3cad71ca744138678eb28be0907feaef1b) Thanks [@workers-devprod](https://github.com/workers-devprod)! - Support `no_bundle` config in Pages for both `dev` and `deploy`.

  This was already supported via a command line arg (`--no-bundle`).

- [#8521](https://github.com/cloudflare/workers-sdk/pull/8521) [`5cd32b1`](https://github.com/cloudflare/workers-sdk/commit/5cd32b193d44c88c1e6e12eb542647c537caa1e1) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: throw explicit error for unknown mimetype during `wrangler check startup`

- [#8504](https://github.com/cloudflare/workers-sdk/pull/8504) [`0192aae`](https://github.com/cloudflare/workers-sdk/commit/0192aae042478197d22e3fa3bfe300cfbfb69615) Thanks [@workers-devprod](https://github.com/workers-devprod)! - Fix Workers Assets metafiles (`_headers` and `_redirects`) resolution when running Wrangler from a different directory

- Updated dependencies [[`f90a669`](https://github.com/cloudflare/workers-sdk/commit/f90a6693310ebc04adfd8d7a9665011b0a7dba79)]:
  - miniflare@3.20250310.1

## 3.114.1

### Patch Changes

- [#8383](https://github.com/cloudflare/workers-sdk/pull/8383) [`8d6d722`](https://github.com/cloudflare/workers-sdk/commit/8d6d7224bcebe04691478e2c5261c00992a1747a) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - Make kv bulk put --local respect base64:true

  The bulk put api has an optional "base64" boolean property for each key.
  Before storing the key, the value should be decoded from base64.

  For real (remote) kv, this is handled by the rest api. For local kv, it
  seems the base64 field was ignored, meaning encoded base64 content was
  stored locally rather than the raw values.

  To fix, we need to decode each value before putting to the local
  miniflare namespace when base64 is true.

- [#8273](https://github.com/cloudflare/workers-sdk/pull/8273) [`e3efd68`](https://github.com/cloudflare/workers-sdk/commit/e3efd68e3989815f6935fa4315e0aa23aaac11c9) Thanks [@penalosa](https://github.com/penalosa)! - Support AI, Vectorize, and Images bindings when using `@cloudflare/vite-plugin`

- [#8427](https://github.com/cloudflare/workers-sdk/pull/8427) [`a352798`](https://github.com/cloudflare/workers-sdk/commit/a3527988e8849eab92b66cfb3a30334bef706b34) Thanks [@vicb](https://github.com/vicb)! - update unenv-preset dependency to fix bug with Performance global

  Fixes #8407
  Fixes #8409
  Fixes #8411

- [#8390](https://github.com/cloudflare/workers-sdk/pull/8390) [`53e6323`](https://github.com/cloudflare/workers-sdk/commit/53e63233c5b9bb786af3daea63c10ffe60a5d881) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Parse and apply metafiles (`_headers` and `_redirects`) in `wrangler dev` for Workers Assets

- [#8392](https://github.com/cloudflare/workers-sdk/pull/8392) [`4d9d9e6`](https://github.com/cloudflare/workers-sdk/commit/4d9d9e6c830b32a0e9948ace32e20a1cdac3a53b) Thanks [@jahands](https://github.com/jahands)! - fix: retry zone and route lookup API calls

  In rare cases, looking up Zone or Route API calls may fail due to transient errors. This change improves the reliability of `wrangler deploy` when these errors occur.

  Also fixes a rare issue where concurrent API requests may fail without correctly throwing an error which may cause a deployment to incorrectly appear successful.

- Updated dependencies [[`8242e07`](https://github.com/cloudflare/workers-sdk/commit/8242e07447f47ab764655e8ec9a046b1fe9ea279), [`53e6323`](https://github.com/cloudflare/workers-sdk/commit/53e63233c5b9bb786af3daea63c10ffe60a5d881)]:
  - miniflare@3.20250310.0

## 3.114.0

### Minor Changes

- [#8367](https://github.com/cloudflare/workers-sdk/pull/8367) [`7b6b0c2`](https://github.com/cloudflare/workers-sdk/commit/7b6b0c213c6e490934cca1943e39268f574281e4) Thanks [@jonesphillip](https://github.com/jonesphillip)! - Deprecated `--id` parameter in favor of `--name` for both the `wrangler r2 bucket lifecycle` and `wrangler r2 bucket lock` commands

## 3.113.0

### Minor Changes

- [#8300](https://github.com/cloudflare/workers-sdk/pull/8300) [`bca1fb5`](https://github.com/cloudflare/workers-sdk/commit/bca1fb5510f79820d558be839f459de3d50505e0) Thanks [@vicb](https://github.com/vicb)! - Use the unenv preset for Cloudflare from `@cloudflare/unenv-preset`

### Patch Changes

- [#8338](https://github.com/cloudflare/workers-sdk/pull/8338) [`2d40989`](https://github.com/cloudflare/workers-sdk/commit/2d409892f1cf08f07f84d25dcab023bc20ada374) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Upload \_headers and \_redirects if present with Workers Assets as part of `wrangler deploy` and `wrangler versions upload`.

- [#8288](https://github.com/cloudflare/workers-sdk/pull/8288) [`cf14e17`](https://github.com/cloudflare/workers-sdk/commit/cf14e17d40b9e51475ba4d9ee6b4e3ef5ae5e841) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Add assets Proxy Worker skeleton in miniflare

  This commit implements a very basic Proxy Worker skeleton, and wires it in the "pipeline" miniflare creates for assets. This Worker will be incrementally worked on, but for now, the current implementation will forward all incoming requests to the Router Worker, thus leaving the current assets behaviour in local dev, the same.

  This is an experimental feature available under the `--x-assets-rpc` flag: `wrangler dev --x-assets-rpc`.

- [#8216](https://github.com/cloudflare/workers-sdk/pull/8216) [`af9a57a`](https://github.com/cloudflare/workers-sdk/commit/af9a57a327d9283ebf62ef6dc074f2005a57b669) Thanks [@ns476](https://github.com/ns476)! - Support Images binding in `wrangler types`

- [#8304](https://github.com/cloudflare/workers-sdk/pull/8304) [`fbba583`](https://github.com/cloudflare/workers-sdk/commit/fbba583df9340a011fda538e4c9c6480129be1fd) Thanks [@jahands](https://github.com/jahands)! - chore: add concurrency and caching for Zone IDs and Workers routes lookups

  Workers with many routes can result in duplicate Zone lookups during deployments, making deployments unnecessarily slow. This compounded by the lack of concurrency when making these API requests.

  This change deduplicates these requests and adds concurrency to help speed up deployments.

- Updated dependencies [[`2d40989`](https://github.com/cloudflare/workers-sdk/commit/2d409892f1cf08f07f84d25dcab023bc20ada374), [`da568e5`](https://github.com/cloudflare/workers-sdk/commit/da568e5a94bf270cfdcd80123d8161fc5437dcd2), [`cf14e17`](https://github.com/cloudflare/workers-sdk/commit/cf14e17d40b9e51475ba4d9ee6b4e3ef5ae5e841), [`79c7810`](https://github.com/cloudflare/workers-sdk/commit/79c781076cc79e512753b65644c027138aa1d878)]:
  - miniflare@3.20250224.0

## 3.112.0

### Minor Changes

- [#8256](https://github.com/cloudflare/workers-sdk/pull/8256) [`f59d95b`](https://github.com/cloudflare/workers-sdk/commit/f59d95b6f48ee2ea902202af2778a1598596ebbd) Thanks [@jbwcloudflare](https://github.com/jbwcloudflare)! - Add two new Queues commands: pause-delivery and resume-delivery

  These new commands allow users to pause and resume the delivery of messages to Queue Consumers

### Patch Changes

- [#8274](https://github.com/cloudflare/workers-sdk/pull/8274) [`fce642d`](https://github.com/cloudflare/workers-sdk/commit/fce642d59264b1b6e7df8a6c9a015519b7574637) Thanks [@emily-shen](https://github.com/emily-shen)! - fix bindings to entrypoints on the same worker in workers with assets

- [#8201](https://github.com/cloudflare/workers-sdk/pull/8201) [`2cad136`](https://github.com/cloudflare/workers-sdk/commit/2cad136e99c48c2bf64c0010a8ecc7465be79b03) Thanks [@ichernetsky-cf](https://github.com/ichernetsky-cf)! - fix: interactively list Cloudchamber deployments using labels

- [#8289](https://github.com/cloudflare/workers-sdk/pull/8289) [`a4909cb`](https://github.com/cloudflare/workers-sdk/commit/a4909cbe552eae72b901cd78bf1f814f818085a0) Thanks [@penalosa](https://github.com/penalosa)! - Add the experimental `--x-assets-rpc` flag to gate feature work to support JSRPC with Workers + Assets projects.

- Updated dependencies [[`fce642d`](https://github.com/cloudflare/workers-sdk/commit/fce642d59264b1b6e7df8a6c9a015519b7574637), [`a4909cb`](https://github.com/cloudflare/workers-sdk/commit/a4909cbe552eae72b901cd78bf1f814f818085a0)]:
  - miniflare@3.20250214.2

## 3.111.0

### Minor Changes

- [#7977](https://github.com/cloudflare/workers-sdk/pull/7977) [`36ef9c6`](https://github.com/cloudflare/workers-sdk/commit/36ef9c6209c937570711ff407fd29de6fb7cf267) Thanks [@jkoe-cf](https://github.com/jkoe-cf)! - Added wrangler r2 commands for bucket lock configuration

### Patch Changes

- [#8248](https://github.com/cloudflare/workers-sdk/pull/8248) [`1cb2d34`](https://github.com/cloudflare/workers-sdk/commit/1cb2d3418b21b4d54d1c8debbfc91a5efc8f5708) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Omits Content-Type header for files of an unknown extension in Workers Assets

- [#7977](https://github.com/cloudflare/workers-sdk/pull/7977) [`36ef9c6`](https://github.com/cloudflare/workers-sdk/commit/36ef9c6209c937570711ff407fd29de6fb7cf267) Thanks [@jkoe-cf](https://github.com/jkoe-cf)! - fixing the format of the R2 lifecycle rule date input to be parsed as string instead of number

## 3.110.0

### Minor Changes

- [#8253](https://github.com/cloudflare/workers-sdk/pull/8253) [`6dd1e23`](https://github.com/cloudflare/workers-sdk/commit/6dd1e2300ec393e210bfdb6d0a7cf4ade17b6ad4) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Add `--cwd` global argument to the `wrangler` CLI to allow changing the current working directory before running any command.

### Patch Changes

- [#8191](https://github.com/cloudflare/workers-sdk/pull/8191) [`968c3d9`](https://github.com/cloudflare/workers-sdk/commit/968c3d9c068fa895b30f0198d7c8873a00709e62) Thanks [@vicb](https://github.com/vicb)! - Optimize global injection in node compat mode

- [#8247](https://github.com/cloudflare/workers-sdk/pull/8247) [`a9a4c33`](https://github.com/cloudflare/workers-sdk/commit/a9a4c33143b9f58673ac0cdd251957997275fa10) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Omits Content-Type header for files of an unknown extension in Workers Assets

- Updated dependencies [[`a9a4c33`](https://github.com/cloudflare/workers-sdk/commit/a9a4c33143b9f58673ac0cdd251957997275fa10), [`6cae13a`](https://github.com/cloudflare/workers-sdk/commit/6cae13aa5f338cee18ec2e43a5dadda0c7d8dc2e)]:
  - miniflare@3.20250214.1

## 3.109.3

### Patch Changes

- [#8175](https://github.com/cloudflare/workers-sdk/pull/8175) [`eb46f98`](https://github.com/cloudflare/workers-sdk/commit/eb46f987ccd215e95a9d56c60841c7c996931b2f) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: `unstable_splitSqlQuery` should ignore comments when splitting sql into statements

## 3.109.2

### Patch Changes

- [#7687](https://github.com/cloudflare/workers-sdk/pull/7687) [`cc853cf`](https://github.com/cloudflare/workers-sdk/commit/cc853cf0dcefc35c9d9022b9a1641d2d77c19da8) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: bug where Pages deployments that create new projects were failing with a new repo

- [#8131](https://github.com/cloudflare/workers-sdk/pull/8131) [`efd7f97`](https://github.com/cloudflare/workers-sdk/commit/efd7f9764199ef67dff14155bd3dd249c4dff5c7) Thanks [@lambrospetrou](https://github.com/lambrospetrou)! - D1 export will now show an error when the presigned URL is invalid

- Updated dependencies [[`5e06177`](https://github.com/cloudflare/workers-sdk/commit/5e06177861b29aa9b114f9ecb50093190af94f4b)]:
  - miniflare@3.20250214.0

## 3.109.1

### Patch Changes

- [#8021](https://github.com/cloudflare/workers-sdk/pull/8021) [`28b1dc7`](https://github.com/cloudflare/workers-sdk/commit/28b1dc7c6f213de336d58ce93308575de8f42f06) Thanks [@0xD34DC0DE](https://github.com/0xD34DC0DE)! - fix: prevent \_\_cf_cjs name collision in the hybrid Nodejs compat plugin

## 3.109.0

### Minor Changes

- [#8120](https://github.com/cloudflare/workers-sdk/pull/8120) [`3fb801f`](https://github.com/cloudflare/workers-sdk/commit/3fb801f734632c165685799cb1b752c4dad0445a) Thanks [@sdnts](https://github.com/sdnts)! - Add a new `update` subcommand for Queues to allow updating Queue settings

- [#8120](https://github.com/cloudflare/workers-sdk/pull/8120) [`3fb801f`](https://github.com/cloudflare/workers-sdk/commit/3fb801f734632c165685799cb1b752c4dad0445a) Thanks [@sdnts](https://github.com/sdnts)! - Allow overriding message retention duration when creating Queues

- [#8026](https://github.com/cloudflare/workers-sdk/pull/8026) [`542c6ea`](https://github.com/cloudflare/workers-sdk/commit/542c6ead5d7c7e64a103abd5572ec7b8aea96c90) Thanks [@penalosa](https://github.com/penalosa)! - Add `--outfile` to `wrangler deploy` for generating a worker bundle.

  This is an advanced feature that most users won't need to use. When set, Wrangler will output your built Worker bundle in a Cloudflare specific format that captures all information needed to deploy a Worker using the [Worker Upload API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/)

- [#8026](https://github.com/cloudflare/workers-sdk/pull/8026) [`542c6ea`](https://github.com/cloudflare/workers-sdk/commit/542c6ead5d7c7e64a103abd5572ec7b8aea96c90) Thanks [@penalosa](https://github.com/penalosa)! - Add a `wrangler check startup` command to generate a CPU profile of your Worker's startup phase.

  This can be imported into Chrome DevTools or opened directly in VSCode to view a flamegraph of your Worker's startup phase. Additionally, when a Worker deployment fails with a startup time error Wrangler will automatically generate a CPU profile for easy investigation.

  Advanced usage:

  - `--args`: to customise the way `wrangler check startup` builds your Worker for analysis, provide the exact arguments you use when deploying your Worker with `wrangler deploy`. For instance, if you deploy your Worker with `wrangler deploy --no-bundle`, you should use `wrangler check startup --args="--no-bundle"` to profile the startup phase.
  - `--worker-bundle`: if you don't use Wrangler to deploy your Worker, you can use this argument to provide a Worker bundle to analyse. This should be a file path to a serialised multipart upload, with the exact same format as the API expects: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/

### Patch Changes

- [#8112](https://github.com/cloudflare/workers-sdk/pull/8112) [`fff677e`](https://github.com/cloudflare/workers-sdk/commit/fff677e35f67c28275262c1d19f7eb4d6c6ab071) Thanks [@penalosa](https://github.com/penalosa)! - When reporting errors to Sentry, Wrangler will now include the console output as additional metadata

- [#8120](https://github.com/cloudflare/workers-sdk/pull/8120) [`3fb801f`](https://github.com/cloudflare/workers-sdk/commit/3fb801f734632c165685799cb1b752c4dad0445a) Thanks [@sdnts](https://github.com/sdnts)! - Check bounds when overriding delivery delay when creating Queues

- [#7950](https://github.com/cloudflare/workers-sdk/pull/7950) [`4db1fb5`](https://github.com/cloudflare/workers-sdk/commit/4db1fb5696412c6666589a778184e10386294d71) Thanks [@cmackenzie1](https://github.com/cmackenzie1)! - Add local binding support for Worker Pipelines

- [#8119](https://github.com/cloudflare/workers-sdk/pull/8119) [`1bc60d7`](https://github.com/cloudflare/workers-sdk/commit/1bc60d761ebf67a64ac248e3e2c826407bc26252) Thanks [@penalosa](https://github.com/penalosa)! - Output correct config format from `wrangler d1 create`. Previously, this command would always output TOML, regardless of the config file format

- [#8130](https://github.com/cloudflare/workers-sdk/pull/8130) [`1aa2a91`](https://github.com/cloudflare/workers-sdk/commit/1aa2a9198578f8eb106f19c8475a63ff4eef26aa) Thanks [@emily-shen](https://github.com/emily-shen)! - Include default values for wrangler types --path and --x-include-runtime in telemetry

  User provided strings are still left redacted as always.

- [#8061](https://github.com/cloudflare/workers-sdk/pull/8061) [`35710e5`](https://github.com/cloudflare/workers-sdk/commit/35710e590f20e5c83fb25138ba4ae7890b780a08) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: respect `WRANGLER_LOG` in `wrangler dev`

  Previously, `--log-level=debug` was the only way to see debug logs in `wrangler dev`, which was unlike all other commands.

- Updated dependencies [[`4db1fb5`](https://github.com/cloudflare/workers-sdk/commit/4db1fb5696412c6666589a778184e10386294d71)]:
  - miniflare@3.20250204.1

## 3.108.1

### Patch Changes

- [#8103](https://github.com/cloudflare/workers-sdk/pull/8103) [`a025ad2`](https://github.com/cloudflare/workers-sdk/commit/a025ad2ecb086cb4bcee6b9dfd8cf06eb2102ade) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: fix bug where `wrangler secret list --format=json` was printing the wrangler banner.

- Updated dependencies []:
  - miniflare@3.20250204.0

## 3.108.0

### Minor Changes

- [#7990](https://github.com/cloudflare/workers-sdk/pull/7990) [`b1966df`](https://github.com/cloudflare/workers-sdk/commit/b1966dfe57713f3ddcaa781d0551a1088a22424e) Thanks [@cmsparks](https://github.com/cmsparks)! - Add WRANGLER_CI_OVERRIDE_NAME for Workers CI

- [#8028](https://github.com/cloudflare/workers-sdk/pull/8028) [`b2dca9a`](https://github.com/cloudflare/workers-sdk/commit/b2dca9a2fb885cb4da87a959fefa035c0974d15c) Thanks [@emily-shen](https://github.com/emily-shen)! - feat: Also log when _no_ bindings are found.

  We currently print a worker's bindings during dev, versions upload and deploy. This just also prints something when there's no bindings found, in case you _were_ expecting bindings.

- [#8037](https://github.com/cloudflare/workers-sdk/pull/8037) [`71fd250`](https://github.com/cloudflare/workers-sdk/commit/71fd250f67a02feab7a2f66623ac8bd52b7f7f21) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Provides unsafe.metadata configurations when using wrangler versions secret put.

### Patch Changes

- [#8058](https://github.com/cloudflare/workers-sdk/pull/8058) [`1f80d69`](https://github.com/cloudflare/workers-sdk/commit/1f80d69f566d240428ddec0c7b62a23c6f5af3c1) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Bugfix: Modified versions secret put to inherit all known bindings, which circumvents a limitation in the API which does not return all fields for all bindings.

- [#7986](https://github.com/cloudflare/workers-sdk/pull/7986) [`88514c8`](https://github.com/cloudflare/workers-sdk/commit/88514c82d447903e48d9f782446a6b502e553631) Thanks [@andyjessop](https://github.com/andyjessop)! - docs: clarifies that local resources are "simulated locally" or "connected to remote resource", and adds console messages to help explain local dev

- [#8008](https://github.com/cloudflare/workers-sdk/pull/8008) [`9d08af8`](https://github.com/cloudflare/workers-sdk/commit/9d08af81893df499d914b890d784a9554ebf9507) Thanks [@ns476](https://github.com/ns476)! - Add support for Images bindings (in private beta for now), with optional local support for platforms where Sharp is available.

- [#7769](https://github.com/cloudflare/workers-sdk/pull/7769) [`6abe69c`](https://github.com/cloudflare/workers-sdk/commit/6abe69c3fe1fb2e762153a3094119ed83038a50b) Thanks [@cmackenzie1](https://github.com/cmackenzie1)! - Adds the following new option for `wrangler pipelines create` and `wrangler pipelines update` commands:

  ```
  --cors-origins           CORS origin allowlist for HTTP endpoint (use * for any origin)  [array]
  ```

- [#7290](https://github.com/cloudflare/workers-sdk/pull/7290) [`0c0374c`](https://github.com/cloudflare/workers-sdk/commit/0c0374cce3908a47f7459ba4810855c1ce124349) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: add support for workers with assets when running multiple workers in one `wrangler dev` instance

  https://github.com/cloudflare/workers-sdk/pull/7251 added support for running multiple Workers in one `wrangler dev`/miniflare session. e.g. `wrangler dev -c wrangler.toml -c ../worker2/wrangler.toml`, which among other things, allowed cross-service RPC to Durable Objects.

  However this did not work in the same way as production when there was a Worker with assets - this PR should fix that.

- [#7769](https://github.com/cloudflare/workers-sdk/pull/7769) [`6abe69c`](https://github.com/cloudflare/workers-sdk/commit/6abe69c3fe1fb2e762153a3094119ed83038a50b) Thanks [@cmackenzie1](https://github.com/cmackenzie1)! - Rename wrangler pipelines <create|update> flags

  The following parameters have been renamed:

  | Previous Name     | New Name              |
  | ----------------- | --------------------- |
  | access-key-id     | r2-access-key-id      |
  | secret-access-key | r2-secret-access-key  |
  | transform         | transform-worker      |
  | r2                | r2-bucket             |
  | prefix            | r2-prefix             |
  | binding           | enable-worker-binding |
  | http              | enable-http           |
  | authentication    | require-http-auth     |
  | filename          | file-template         |
  | filepath          | partition-template    |

- [#8012](https://github.com/cloudflare/workers-sdk/pull/8012) [`c412a31`](https://github.com/cloudflare/workers-sdk/commit/c412a31985f3c622e5e3cf366699f9e6977184a2) Thanks [@mtlemilio](https://github.com/mtlemilio)! - Use fetchPagedListResult when listing Hyperdrive configs from the API

  This fixes an issue where only 20 configs were being listed.

- [#8077](https://github.com/cloudflare/workers-sdk/pull/8077) [`60310cd`](https://github.com/cloudflare/workers-sdk/commit/60310cd796468e96571a4d0520f92af54da62630) Thanks [@emily-shen](https://github.com/emily-shen)! - feat: add telemetry to experimental auto-provisioning

- Updated dependencies [[`c80dbd8`](https://github.com/cloudflare/workers-sdk/commit/c80dbd8d5e53a081cf600e250f1ddda860be1a12), [`0c0374c`](https://github.com/cloudflare/workers-sdk/commit/0c0374cce3908a47f7459ba4810855c1ce124349)]:
  - miniflare@3.20250204.0

## 3.107.3

### Patch Changes

- [#7378](https://github.com/cloudflare/workers-sdk/pull/7378) [`59c7c8e`](https://github.com/cloudflare/workers-sdk/commit/59c7c8ee177d9345948a416377c6625269d58925) Thanks [@IRCody](https://github.com/IRCody)! - Add build and push helper sub-commands under the cloudchamber command.

- Updated dependencies []:
  - miniflare@3.20250129.0

## 3.107.2

### Patch Changes

- [#7988](https://github.com/cloudflare/workers-sdk/pull/7988) [`444a630`](https://github.com/cloudflare/workers-sdk/commit/444a6302f194150b0678da5b564cfd2de8a3dad6) Thanks [@edmundhung](https://github.com/edmundhung)! - Fix #7985.

  This reverts the changes on #7945 that caused compatibility issues with Node 16 due to the introduction of `sharp`.

## 3.107.1

### Patch Changes

- [#7981](https://github.com/cloudflare/workers-sdk/pull/7981) [`e2b3306`](https://github.com/cloudflare/workers-sdk/commit/e2b3306e1721dbc0ba8e0eb2025a519b80adbd01) Thanks [@WalshyDev](https://github.com/WalshyDev)! - Fixes a regression introduced in Wrangler 3.107.0 in which `[assets]` was not being inherited from the top-level environment.

- Updated dependencies [[`ab49886`](https://github.com/cloudflare/workers-sdk/commit/ab498862b96551774f601403d3e93d2105a18a91)]:
  - miniflare@3.20250129.0

## 3.107.0

### Minor Changes

- [#7897](https://github.com/cloudflare/workers-sdk/pull/7897) [`34f9797`](https://github.com/cloudflare/workers-sdk/commit/34f9797822836b98edc4d8ddc6e2fb0ab322b864) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - chore: provides `run_worker_first` for Worker-script-first configuration. Deprecates `experimental_serve_directly`.

### Patch Changes

- [#7945](https://github.com/cloudflare/workers-sdk/pull/7945) [`d758215`](https://github.com/cloudflare/workers-sdk/commit/d7582150a5dc6568ac1d1ebcdf24667c83c6a5eb) Thanks [@ns476](https://github.com/ns476)! - Add Images binding (in private beta for the time being)

- [#7947](https://github.com/cloudflare/workers-sdk/pull/7947) [`f57bc4e`](https://github.com/cloudflare/workers-sdk/commit/f57bc4e059b19334783f8f8f7d46c5a710a589ae) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: avoid `getPlatformProxy` logging twice that it is using vars defined in `.dev.vars` files

  when `getPlatformProxy` is called and it retrieves values from `.dev.vars` files, it logs twice
  a message like: `Using vars defined in .dev.vars`, the changes here make sure that in such cases
  this log only appears once

- [#7889](https://github.com/cloudflare/workers-sdk/pull/7889) [`38db4ed`](https://github.com/cloudflare/workers-sdk/commit/38db4ed4de3bed0b4c33d23ee035882a71fbb26b) Thanks [@emily-shen](https://github.com/emily-shen)! - feat: add experimental resource auto-provisioning to versions upload

- [#7864](https://github.com/cloudflare/workers-sdk/pull/7864) [`de6fa18`](https://github.com/cloudflare/workers-sdk/commit/de6fa1846ac793a86356a319a09482f08819b632) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Update the `unstable_getMiniflareWorkerOptions` types to always include an `env` parameter.

  The `unstable_getMiniflareWorkerOptions` types, when accepting a config object as the first argument,
  didn't accept a second `env` argument. The changes here make sure they do, since the `env` is still
  relevant for picking up variables from `.dev.vars` files.

- [#7964](https://github.com/cloudflare/workers-sdk/pull/7964) [`bc4d6c8`](https://github.com/cloudflare/workers-sdk/commit/bc4d6c8d25f40308231e9109dc643df68bc72b52) Thanks [@LuisDuarte1](https://github.com/LuisDuarte1)! - Fix scripts binding to a workflow in a different script overriding workflow config

- Updated dependencies [[`cf4f47a`](https://github.com/cloudflare/workers-sdk/commit/cf4f47a8af2dc476f8a0e61f0d22f080f191de1f)]:
  - miniflare@3.20250124.1

## 3.106.0

### Minor Changes

- [#7856](https://github.com/cloudflare/workers-sdk/pull/7856) [`2b6f149`](https://github.com/cloudflare/workers-sdk/commit/2b6f1496685b23b6734c3001db49d3086005582e) Thanks [@emily-shen](https://github.com/emily-shen)! - feat: add sanitised error messages to Wrangler telemetry

  Error messages that have been audited for potential inclusion of personal information, and explicitly opted-in, are now included in Wrangler's telemetry collection. Collected error messages will not include any filepaths, user input or any other potentially private content.

- [#7900](https://github.com/cloudflare/workers-sdk/pull/7900) [`bd9228e`](https://github.com/cloudflare/workers-sdk/commit/bd9228e855c25b2f5d94e298d6d1128484019f83) Thanks [@vicb](https://github.com/vicb)! - chore(wrangler): update unenv dependency version

  `unenv@2.0.0-rc.1` allows using the workerd implementation for
  the Node modules `net`, `timers`, and `timers/promises`.
  See `unjs/unenv#396`.

### Patch Changes

- [#7904](https://github.com/cloudflare/workers-sdk/pull/7904) [`50b13f6`](https://github.com/cloudflare/workers-sdk/commit/50b13f60af0eac176a000caf7cc799b21fe3f3c5) Thanks [@WalshyDev](https://github.com/WalshyDev)! - fix: validation for R2 bucket names, the regex was wrongly rejecting buckets starting with a number and the message wasn't as clear as it could be on what was going wrong.

- [#7895](https://github.com/cloudflare/workers-sdk/pull/7895) [`134d61d`](https://github.com/cloudflare/workers-sdk/commit/134d61d97bb96337220e530f4af2ec2c8236f383) Thanks [@jahands](https://github.com/jahands)! - Fix regression in retryOnAPIFailure preventing any requests from being retried

  Also fixes a regression in pipelines that prevented 401 errors from being retried when waiting for an API token to become active.

- [#7879](https://github.com/cloudflare/workers-sdk/pull/7879) [`5c02e46`](https://github.com/cloudflare/workers-sdk/commit/5c02e46c89cce24d81d696173b0e52ce04a8ba59) Thanks [@andyjessop](https://github.com/andyjessop)! - Fix to not require local connection string when using Hyperdrive and wrangler dev --remote

- [#7860](https://github.com/cloudflare/workers-sdk/pull/7860) [`13ab591`](https://github.com/cloudflare/workers-sdk/commit/13ab5916058e8e834f3e13fb9b5b9d9addc0f930) Thanks [@vicb](https://github.com/vicb)! - refactor(wrangler): make JSON parsing independent of Node

  Switch `jsonc-parser` to parse json:

  - `JSON.parse()` exception messages are not stable across Node versions
  - While `jsonc-parser` is used, JSONC specific syntax is disabled

- Updated dependencies []:
  - miniflare@3.20250124.0

## 3.105.1

### Patch Changes

- [#7884](https://github.com/cloudflare/workers-sdk/pull/7884) [`fd5a455`](https://github.com/cloudflare/workers-sdk/commit/fd5a45520e92e0fe60c457a6ae54caef67d7bbcf) Thanks [@emily-shen](https://github.com/emily-shen)! - feat: make experiemntal auto-provisioning non-interactive by default.

- [#7811](https://github.com/cloudflare/workers-sdk/pull/7811) [`7d138d9`](https://github.com/cloudflare/workers-sdk/commit/7d138d92c3cbfb84bccb84a3e93f41ad5549d604) Thanks [@joshthoward](https://github.com/joshthoward)! - Fix RPC method invocations showing up as unknown events

- Updated dependencies [[`40f89a9`](https://github.com/cloudflare/workers-sdk/commit/40f89a90d93f57294e49a6b5ed8ba8cc38e0da77)]:
  - miniflare@3.20250124.0

## 3.105.0

### Minor Changes

- [#7466](https://github.com/cloudflare/workers-sdk/pull/7466) [`e5ebdb1`](https://github.com/cloudflare/workers-sdk/commit/e5ebdb143788728d8b364fcafc0b36bda4ceb625) Thanks [@Ltadrian](https://github.com/Ltadrian)! - feat: implement the `wrangler cert upload` command

  This command allows users to upload a mTLS certificate/private key or certificate-authority certificate chain.

  For uploading mTLS certificate, run:

  - `wrangler cert upload mtls-certificate --cert cert.pem --key key.pem --name MY_CERT`

  For uploading CA certificate chain, run:

  - `wrangler cert upload certificate-authority --ca-cert server-ca.pem --name SERVER_CA`

### Patch Changes

- [#7867](https://github.com/cloudflare/workers-sdk/pull/7867) [`bdc7958`](https://github.com/cloudflare/workers-sdk/commit/bdc7958f22bbbb9ce2608fefd295054121a92441) Thanks [@penalosa](https://github.com/penalosa)! - Revert https://github.com/cloudflare/workers-sdk/pull/7816. This feature added support for the ASSETS bindings to the `getPlatformProxy()` API, but caused a regression when running `npm run preview` in newly generated Workers Assets projects.

- [#7868](https://github.com/cloudflare/workers-sdk/pull/7868) [`78a9a2d`](https://github.com/cloudflare/workers-sdk/commit/78a9a2db485fefb0038ea9d97cc547a9218b7afa) Thanks [@penalosa](https://github.com/penalosa)! - Revert "Hyperdrive dev remote fix". This PR includes e2e tests that were not run before merging, and are currently failing.

- Updated dependencies []:
  - miniflare@3.20241230.2

## 3.104.0

### Minor Changes

- [#7715](https://github.com/cloudflare/workers-sdk/pull/7715) [`26fa9e8`](https://github.com/cloudflare/workers-sdk/commit/26fa9e80279401ba5eea4e1522597953441402f2) Thanks [@penalosa](https://github.com/penalosa)! - Support service bindings from Pages projects to Workers in a single `workerd` instance. To try it out, pass multiple `-c` flags to Wrangler: i.e. `wrangler pages dev -c wrangler.toml -c ../other-worker/wrangler.toml`. The first `-c` flag must point to your Pages config file, and the rest should point to Workers that are bound to your Pages project.

- [#7816](https://github.com/cloudflare/workers-sdk/pull/7816) [`f6cc029`](https://github.com/cloudflare/workers-sdk/commit/f6cc0293d3a6bf45a323b6d9718b7162149cc84f) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add support for assets bindings to `getPlatformProxy`

  this change makes sure that that `getPlatformProxy`, when the input configuration
  file contains an assets field, correctly returns the appropriate asset binding proxy

  example:

  ```json
  // wrangler.json
  {
  	"name": "my-worker",
  	"assets": {
  		"directory": "./public/",
  		"binding": "ASSETS"
  	},
  	"vars": {
  		"MY_VAR": "my-var"
  	}
  }
  ```

  ```js
  import { getPlatformProxy } from "wrangler";

  const { env, dispose } = await getPlatformProxy();

  if (env.ASSETS) {
  	const text = await (
  		await env.ASSETS.fetch("http://0.0.0.0/file.txt")
  	).text();
  	console.log(text); // logs the content of file.txt
  }

  await dispose();
  ```

### Patch Changes

- [#7785](https://github.com/cloudflare/workers-sdk/pull/7785) [`cccfe51`](https://github.com/cloudflare/workers-sdk/commit/cccfe51ca6a18a2a69bb6c7fa7066c92c9d704af) Thanks [@joshthoward](https://github.com/joshthoward)! - Fix Durable Objects transfer migration validation

- [#7821](https://github.com/cloudflare/workers-sdk/pull/7821) [`fcaa02c`](https://github.com/cloudflare/workers-sdk/commit/fcaa02cdf4f3f648d7218e8f7fb411a2324eebb5) Thanks [@vicb](https://github.com/vicb)! - fix(wrangler): fix wrangler config schema defaults

- [#7832](https://github.com/cloudflare/workers-sdk/pull/7832) [`97d2a1b`](https://github.com/cloudflare/workers-sdk/commit/97d2a1bb56ea0bb94531f9c41b737ba43ed5996f) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Relax the messaging when Wrangler uses redirected configuration

  Previously the messaging was rendered as a warning, which implied that the user
  had done something wrong. Now it is just a regular info message.

- [#7806](https://github.com/cloudflare/workers-sdk/pull/7806) [`d7adb50`](https://github.com/cloudflare/workers-sdk/commit/d7adb50fcc9e3c509365fed8a86df485ea9f739b) Thanks [@vicb](https://github.com/vicb)! - chore: update unenv to 2.0.0-rc.0

  Pull a couple changes in node:timers

  - unjs/unenv#384 fix function bindings in node:timer
  - unjs/unenv#385 implement active and \_unrefActive in node:timer

  The unenv update also includes #unjs/unenv/381 which implements
  `stdout`, `stderr` and `stdin` of `node:process` with `node:tty`

- [#7828](https://github.com/cloudflare/workers-sdk/pull/7828) [`9077a67`](https://github.com/cloudflare/workers-sdk/commit/9077a6748a30d5f24c9b7cbdc3a6514fec5aa66c) Thanks [@edmundhung](https://github.com/edmundhung)! - improve multi account error message in non-interactive mode

- Updated dependencies []:
  - miniflare@3.20241230.2

## 3.103.2

### Patch Changes

- [#7804](https://github.com/cloudflare/workers-sdk/pull/7804) [`16a9460`](https://github.com/cloudflare/workers-sdk/commit/16a9460ea6c7daaadcdf2f2e921c66521549bc58) Thanks [@vicb](https://github.com/vicb)! - fix(wrangler): use require.resolve to resolve unenv path

## 3.103.1

### Patch Changes

- [#7798](https://github.com/cloudflare/workers-sdk/pull/7798) [`a1ff045`](https://github.com/cloudflare/workers-sdk/commit/a1ff045cfc89f216e19c94e7c4b5d190e27ef5bf) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Reverts #7720 as it introduced breakage in some of the C3 templates (eg. Nuxt)

## 3.103.0

### Minor Changes

- [#5086](https://github.com/cloudflare/workers-sdk/pull/5086) [`8faf2c0`](https://github.com/cloudflare/workers-sdk/commit/8faf2c07415030a3c8d9e5fc0e122a59141b3786) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add `--strict-vars` option to `wrangler types`

  add a new `--strict-vars` option to `wrangler types` that developers can (by setting the
  flag to `false`) use to disable the default strict/literal types generation for their variables

  opting out of strict variables can be useful when developers change often their `vars` values,
  even more so when multiple environments are involved

  ## Example

  With a toml containing:

  ```toml
  [vars]
  MY_VARIABLE = "production_value"
  MY_NUMBERS = [1, 2, 3]

  [env.staging.vars]
  MY_VARIABLE = "staging_value"
  MY_NUMBERS = [7, 8, 9]
  ```

  the `wrangler types` command would generate the following interface:

  ```
  interface Env {
          MY_VARIABLE: "production_value" | "staging_value";
          MY_NUMBERS: [1,2,3] | [7,8,9];
  }
  ```

  while `wrangler types --strict-vars=false` would instead generate:

  ```
  interface Env {
          MY_VARIABLE: string;
          MY_NUMBERS: number[];
  }
  ```

  (allowing the developer to easily change their toml variables without the
  risk of breaking typescript types)

### Patch Changes

- [#7720](https://github.com/cloudflare/workers-sdk/pull/7720) [`902e3af`](https://github.com/cloudflare/workers-sdk/commit/902e3af15d014fe37f5789ce4bb9c4be2aecb23a) Thanks [@vicb](https://github.com/vicb)! - chore(wrangler): use the unenv preset from `@cloudflare/unenv-preset`

- [#7760](https://github.com/cloudflare/workers-sdk/pull/7760) [`19228e5`](https://github.com/cloudflare/workers-sdk/commit/19228e50f3bd7ed5d32f8132bd02abc9999585ea) Thanks [@vicb](https://github.com/vicb)! - chore: update unenv dependency version

- [#7735](https://github.com/cloudflare/workers-sdk/pull/7735) [`e8aaa39`](https://github.com/cloudflare/workers-sdk/commit/e8aaa39307f44e974c3ab966e7880f50a5ff6bc9) Thanks [@penalosa](https://github.com/penalosa)! - Unwrap the error cause when available to send to Sentry

- [#5086](https://github.com/cloudflare/workers-sdk/pull/5086) [`8faf2c0`](https://github.com/cloudflare/workers-sdk/commit/8faf2c07415030a3c8d9e5fc0e122a59141b3786) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: widen multi-env `vars` types in `wrangler types`

  Currently, the type generated for `vars` is a string literal consisting of the value of the variable in the top level environment. If multiple environments
  are specified this wrongly restricts the type, since the variable could contain any of the values from each of the environments.

  For example, given a `wrangler.toml` containing the following:

  ```
  [vars]
  MY_VAR = "dev value"

  [env.production.vars]
  MY_VAR = "prod value"
  ```

  running `wrangler types` would generate:

  ```ts
  interface Env {
  	MY_VAR: "dev value";
  }
  ```

  making typescript incorrectly assume that `MY_VAR` is always going to be `"dev value"`

  after these changes, the generated interface would instead be:

  ```ts
  interface Env {
  	MY_VAR: "dev value" | "prod value";
  }
  ```

- [#7733](https://github.com/cloudflare/workers-sdk/pull/7733) [`dceb196`](https://github.com/cloudflare/workers-sdk/commit/dceb19608798c2080dc3aa6cfac6f499473f6fb1) Thanks [@emily-shen](https://github.com/emily-shen)! - feat: pull resource names for provisioning from config if provided

  Uses `database_name` and `bucket_name` for provisioning if specified. For R2, this only happens if there is not a bucket with that name already. Also respects R2 `jurisdiction` if provided.

- Updated dependencies []:
  - miniflare@3.20241230.2

## 3.102.0

### Minor Changes

- [#7592](https://github.com/cloudflare/workers-sdk/pull/7592) [`f613276`](https://github.com/cloudflare/workers-sdk/commit/f6132761c80d90c3521c93d48d0f0aed62bb360a) Thanks [@garrettgu10](https://github.com/garrettgu10)! - New filter validation logic supporting set and range queries in Vectorize CLI

### Patch Changes

- [#7750](https://github.com/cloudflare/workers-sdk/pull/7750) [`df0e5be`](https://github.com/cloudflare/workers-sdk/commit/df0e5bef817c09754471ac4842531a1e14e5576a) Thanks [@andyjessop](https://github.com/andyjessop)! - bug: Removes the (local) tag on Vectorize bindings in the console output of `wrangler dev`, and adds-in the same tag for Durable Objects (which are emulated locally in `wrangler dev`).

- [#7732](https://github.com/cloudflare/workers-sdk/pull/7732) [`d102b60`](https://github.com/cloudflare/workers-sdk/commit/d102b60238c1dddfdd829ffee62c451cb526717a) Thanks [@Ankcorn](https://github.com/Ankcorn)! - fix pages secret bulk copy

- [#7706](https://github.com/cloudflare/workers-sdk/pull/7706) [`c63f1b0`](https://github.com/cloudflare/workers-sdk/commit/c63f1b0790d7487074152c958ad10a910d4eae34) Thanks [@penalosa](https://github.com/penalosa)! - Remove the server-based dev registry in favour of the more stable file-based dev registry. There should be no user-facing impact.

- Updated dependencies [[`8e9aa40`](https://github.com/cloudflare/workers-sdk/commit/8e9aa40a6c914a3a9804dccdca7202aecda45ba7)]:
  - miniflare@3.20241230.2

## 3.101.0

### Minor Changes

- [#7534](https://github.com/cloudflare/workers-sdk/pull/7534) [`7c8ae1c`](https://github.com/cloudflare/workers-sdk/commit/7c8ae1c7bcfe4c55dc530a1c86520dbb8dd5fb26) Thanks [@cmackenzie1](https://github.com/cmackenzie1)! - feat: Use OAuth flow to generate R2 tokens for Pipelines

- [#7674](https://github.com/cloudflare/workers-sdk/pull/7674) [`45d1d1e`](https://github.com/cloudflare/workers-sdk/commit/45d1d1edd640f1dc9e2709c68256981a5de26680) Thanks [@Ankcorn](https://github.com/Ankcorn)! - Add support for env files to wrangler secret bulk i.e. `.dev.vars`

  Run `wrangler secret bulk .dev.vars` to add the env file

  ```env
  //.dev.vars
  KEY=VALUE
  KEY_2=VALUE
  ```

  This will upload the secrets KEY and KEY_2 to your worker

- [#7442](https://github.com/cloudflare/workers-sdk/pull/7442) [`e4716cc`](https://github.com/cloudflare/workers-sdk/commit/e4716cc87893a0633bd2d00543b351e83e228970) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add support for redirecting Wrangler to a generated config when running deploy-related commands

  This new feature is designed for build tools and frameworks to provide a deploy-specific configuration,
  which Wrangler can use instead of user configuration when running deploy-related commands.
  It is not expected that developers of Workers will need to use this feature directly.

  ### Affected commands

  The commands that use this feature are:

  - `wrangler deploy`
  - `wrangler dev`
  - `wrangler versions upload`
  - `wrangler versions deploy`
  - `wrangler pages deploy`
  - `wrangler pages build`
  - `wrangler pages build-env`

  ### Config redirect file

  When running these commands, Wrangler will look up the directory tree from the current working directory for a file at the path `.wrangler/deploy/config.json`. This file must contain only a single JSON object of the form:

  ```json
  { "configPath": "../../path/to/wrangler.json" }
  ```

  When this file exists Wrangler will follow the `configPath` (relative to the `.wrangler/deploy/config.json` file) to find an alternative Wrangler configuration file to load and use as part of this command.

  When this happens Wrangler will display a warning to the user to indicate that the configuration has been redirected to a different file than the user's configuration file.

  ### Custom build tool example

  A common approach that a build tool might choose to implement.

  - The user writes code that uses Cloudflare Workers resources, configured via a user `wrangler.toml` file.

    ```toml
    name = "my-worker"
    main = "src/index.ts"
    [[kv_namespaces]]
    binding = "<BINDING_NAME1>"
    id = "<NAMESPACE_ID1>"
    ```

    Note that this configuration points `main` at user code entry-point.

  - The user runs a custom build, which might read the `wrangler.toml` to find the entry-point:

    ```bash
    > my-tool build
    ```

  - This tool generates a `dist` directory that contains both compiled code and a new deployment configuration file, but also a `.wrangler/deploy/config.json` file that redirects Wrangler to this new deployment configuration file:

    ```plain
    - dist
      - index.js
    	- wrangler.json
    - .wrangler
      - deploy
    	  - config.json
    ```

    The `dist/wrangler.json` will contain:

    ```json
    {
    	"name": "my-worker",
    	"main": "./index.js",
    	"kv_namespaces": [
    		{ "binding": "<BINDING_NAME1>", "id": "<NAMESPACE_ID1>" }
    	]
    }
    ```

    And the `.wrangler/deploy/config.json` will contain:

    ```json
    {
    	"configPath": "../../dist/wrangler.json"
    }
    ```

- [#7685](https://github.com/cloudflare/workers-sdk/pull/7685) [`9d2740a`](https://github.com/cloudflare/workers-sdk/commit/9d2740aa582c76040baf8aded1ac73d8bb2edeeb) Thanks [@vicb](https://github.com/vicb)! - allow overriding the unenv preset.

  By default wrangler uses the bundled unenv preset.

  Setting `WRANGLER_UNENV_RESOLVE_PATHS` allow to use another version of the preset.
  Those paths are used when resolving the unenv module identifiers to absolute paths.
  This can be used to test a development version.

- [#7694](https://github.com/cloudflare/workers-sdk/pull/7694) [`f3c2f69`](https://github.com/cloudflare/workers-sdk/commit/f3c2f69b30fe8549a06b8f7d8853fc9a6100803a) Thanks [@joshthoward](https://github.com/joshthoward)! - Default wrangler d1 export to --local rather than failing

### Patch Changes

- [#7456](https://github.com/cloudflare/workers-sdk/pull/7456) [`ff4e77e`](https://github.com/cloudflare/workers-sdk/commit/ff4e77e5ad7f9e259c5ff443284f3bf07c80cb0e) Thanks [@andyjessop](https://github.com/andyjessop)! - chore: removes --experimental-versions flag, as versions is now GA.

- [#7712](https://github.com/cloudflare/workers-sdk/pull/7712) [`6439347`](https://github.com/cloudflare/workers-sdk/commit/6439347a9221cc2818c560bafef95ec1e8e7a7ec) Thanks [@penalosa](https://github.com/penalosa)! - Remove CF-Connecting-IP for requests to the edge preview

- [#7703](https://github.com/cloudflare/workers-sdk/pull/7703) [`e771fe9`](https://github.com/cloudflare/workers-sdk/commit/e771fe9909bafa7249cb694d5dd1a23af8bd807e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - include the top level Worker name in the parsed config structure

- [#7576](https://github.com/cloudflare/workers-sdk/pull/7576) [`773bda8`](https://github.com/cloudflare/workers-sdk/commit/773bda8b38d43102c2a66126df92d3bbc7e80861) Thanks [@cmackenzie1](https://github.com/cmackenzie1)! - Remove defaults for `batch-max-*` pipeline parameters and define value ranges

- Updated dependencies [[`2c76887`](https://github.com/cloudflare/workers-sdk/commit/2c7688737346992d046d2f88eba5c9847ede1365), [`78bdec5`](https://github.com/cloudflare/workers-sdk/commit/78bdec59ce880365b0318eb94d4176b53e950f66)]:
  - miniflare@3.20241230.1

## 3.100.0

### Minor Changes

- [#7604](https://github.com/cloudflare/workers-sdk/pull/7604) [`6c2f173`](https://github.com/cloudflare/workers-sdk/commit/6c2f17341037962bdf675e7008a4d91059465e16) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Capture Workers with static assets in the telemetry data

  We want to measure accurately what this number of Workers + Assets projects running in remote mode is, as this number will be a very helpful data point down the road, when more decisions around remote mode will have to be taken.

  These changes add this kind of insight to our telemetry data, by capturing whether the command running is in the context of a Workers + Assets project.

  N.B. With these changes in place we will be capturing the Workers + Assets context for all commands, not just wrangler dev --remote.

### Patch Changes

- [#7581](https://github.com/cloudflare/workers-sdk/pull/7581) [`cac7fa6`](https://github.com/cloudflare/workers-sdk/commit/cac7fa6160ecc70d8f188de1f494a07c0e1e9626) Thanks [@vicb](https://github.com/vicb)! - chore(wrangler): update unenv dependency version

  unenv now uses the workerd implementation on node:dns
  See the [unjs/unenv#376](https://github.com/unjs/unenv/pull/376)

- [#7625](https://github.com/cloudflare/workers-sdk/pull/7625) [`d8fb032`](https://github.com/cloudflare/workers-sdk/commit/d8fb032ba24ac284147dc481c28ab8dbcf7a9d72) Thanks [@vicb](https://github.com/vicb)! - feat(wrangler): use unenv builtin dependency resolution

  Moving away from `require.resolve()` to handle unenv aliased packages.
  Using the unenv builtin resolution will allow us to drop the .cjs file from the preset
  and to override the base path so that we can test the dev version of the preset.

- [#7533](https://github.com/cloudflare/workers-sdk/pull/7533) [`755a27c`](https://github.com/cloudflare/workers-sdk/commit/755a27c7a5d7f35cb5f05ab2e12af6d64ce323fb) Thanks [@danielgek](https://github.com/danielgek)! - Add warning about the browser rendering not available on local

- [#7614](https://github.com/cloudflare/workers-sdk/pull/7614) [`8abb43f`](https://github.com/cloudflare/workers-sdk/commit/8abb43fcdf0c506fa6268a7f07aa31b398b7daf2) Thanks [@vicb](https://github.com/vicb)! - chore(wrangler): update unenv dependency version

  The updated unenv contains a fix for the module resolution,
  see <https://github.com/unjs/unenv/pull/378>.
  That bug prevented us from using unenv module resolution,
  see <https://github.com/cloudflare/workers-sdk/pull/7583>.

- Updated dependencies [[`b4e0af1`](https://github.com/cloudflare/workers-sdk/commit/b4e0af163548ee8cc0aefc9165f67a0f83ea94d4)]:
  - miniflare@3.20241230.0

## 3.99.0

### Minor Changes

- [#7425](https://github.com/cloudflare/workers-sdk/pull/7425) [`8757579`](https://github.com/cloudflare/workers-sdk/commit/8757579a47d675909230a51f8e09d1611d5cadb1) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Make DX improvements in `wrangler dev --remote`

  Workers + Assets projects have, in certain situations, a relatively degraded `wrangler dev --remote` developer experience, as opposed to Workers proper projects. This is due to the fact that, for Workers + Assets, we need to make extra API calls to:

  1. check for asset files changes
  2. upload the changed assets, if any

  This commit improves the `wrangler dev --remote` DX for Workers + Assets, for use cases when the User Worker/assets change while the API calls for previous changes are still in flight. For such use cases, we have put an exit early strategy in place, that drops the event handler execution of the previous changes, in favour of the handler triggered by the new changes.

- [#7537](https://github.com/cloudflare/workers-sdk/pull/7537) [`086a6b8`](https://github.com/cloudflare/workers-sdk/commit/086a6b8c613b9c8f0f7c4933ffd68f38f7771c3f) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Provide validation around assets.experimental_serve_directly

- [#7568](https://github.com/cloudflare/workers-sdk/pull/7568) [`2bbcb93`](https://github.com/cloudflare/workers-sdk/commit/2bbcb938b1e14cf21da5dc20ce0c8b9bea0f6aad) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Warn users when using smart placement with Workers + Assets and `serve_directly` is set to `false`

### Patch Changes

- [#7521](https://github.com/cloudflare/workers-sdk/pull/7521) [`48e7e10`](https://github.com/cloudflare/workers-sdk/commit/48e7e1035f489639564948edd3789b1740a7873d) Thanks [@emily-shen](https://github.com/emily-shen)! - feat: add experimental_patchConfig()

  `experimental_patchConfig()` can add to a user's config file. It preserves comments if its a `wrangler.jsonc`. However, it is not suitable for `wrangler.toml` with comments as we cannot preserve comments on write.

- Updated dependencies [[`1488e11`](https://github.com/cloudflare/workers-sdk/commit/1488e118b4a43d032e4f2e69afa1c16c2e54aff6), [`7216835`](https://github.com/cloudflare/workers-sdk/commit/7216835bf7489804905751c6b52e75a8945e7974)]:
  - miniflare@3.20241218.0

## 3.98.0

### Minor Changes

- [#7476](https://github.com/cloudflare/workers-sdk/pull/7476) [`5124b5d`](https://github.com/cloudflare/workers-sdk/commit/5124b5da4f8c12bbb6192f2d89241a9c54ab73c7) Thanks [@WalshyDev](https://github.com/WalshyDev)! - feat: allow routing to Workers with Assets on any HTTP route, not just the root. For example, `example.com/blog/*` can now be used to serve assets.
  These assets will be served as though the assets directly were mounted to the root.
  For example, if you have `assets = { directory = "./public/" }`, a route like `"example.com/blog/*"` and a file `./public/blog/logo.png`, this will be available at `example.com/blog/logo.png`. Assets outside of directories which match the configured HTTP routes can still be accessed with the [Assets binding](https://developers.cloudflare.com/workers/static-assets/binding/#binding) or with a [Service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) to this Worker.

- [#7380](https://github.com/cloudflare/workers-sdk/pull/7380) [`72935f9`](https://github.com/cloudflare/workers-sdk/commit/72935f9b25416ff6d1d350e058f0d2a11864fb36) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Add Workers + Assets support in `wrangler dev --remote`

### Patch Changes

- [#7573](https://github.com/cloudflare/workers-sdk/pull/7573) [`fb819f9`](https://github.com/cloudflare/workers-sdk/commit/fb819f9970285d3fc4ca8e98d652238c554d568b) Thanks [@emily-shen](https://github.com/emily-shen)! - feat: add experimental_readRawConfig()

  Adds a Wrangler API to find and read a config file

- [#7549](https://github.com/cloudflare/workers-sdk/pull/7549) [`42b9429`](https://github.com/cloudflare/workers-sdk/commit/42b942916efbd4eb8060e4d61c2e805ec78a1a89) Thanks [@penalosa](https://github.com/penalosa)! - Expand metrics collection to:

  - Detect Pages & Workers CI
  - Filter out default args (e.g. `--x-versions`, `--x-dev-env`, and `--latest`) by only including args that were in `argv`

- [#7583](https://github.com/cloudflare/workers-sdk/pull/7583) [`8def8c9`](https://github.com/cloudflare/workers-sdk/commit/8def8c99e1f74f313a3771c827133c59e1b1032b) Thanks [@penalosa](https://github.com/penalosa)! - Revert support for custom unenv resolve path to address an issue with Wrangler failing to deploy Pages projects with `nodejs_compat_v2` in some cases

## 3.97.0

### Minor Changes

- [#7522](https://github.com/cloudflare/workers-sdk/pull/7522) [`6403e41`](https://github.com/cloudflare/workers-sdk/commit/6403e41b809a20db59ecfd55362368926750c62d) Thanks [@vicb](https://github.com/vicb)! - feat(wrangler): allow overriding the unenv preset.

  By default wrangler uses the bundled unenv preset.

  Setting `WRANGLER_UNENV_RESOLVE_PATHS` allow to use another version of the preset.
  Those paths are used when resolving the unenv module identifiers to absolute paths.
  This can be used to test a development version.

- [#7479](https://github.com/cloudflare/workers-sdk/pull/7479) [`2780849`](https://github.com/cloudflare/workers-sdk/commit/2780849eb56b5e86210eb801ed91892d22ab9310) Thanks [@penalosa](https://github.com/penalosa)! - Accept a JSON file of the format `{ name: string }[]` in `wrangler kv bulk delete`, as well as the current `string[]` format.

### Patch Changes

- [#7541](https://github.com/cloudflare/workers-sdk/pull/7541) [`ca9410a`](https://github.com/cloudflare/workers-sdk/commit/ca9410a4f92a61abc0d759a3abe29da05cedeaed) Thanks [@vicb](https://github.com/vicb)! - chore(wrangler): update unenv dependency version

- [#7345](https://github.com/cloudflare/workers-sdk/pull/7345) [`15aa936`](https://github.com/cloudflare/workers-sdk/commit/15aa936ba46d31e501f427afa32078c16c9f4c4e) Thanks [@edmundhung](https://github.com/edmundhung)! - fix(wrangler): keypress event name is optional

## 3.96.0

### Minor Changes

- [#7510](https://github.com/cloudflare/workers-sdk/pull/7510) [`004af53`](https://github.com/cloudflare/workers-sdk/commit/004af53928ba96060c0d644fc8a98e7a3a5e6957) Thanks [@oliy](https://github.com/oliy)! - Add file prefix option to wrangler pipelines commands

- [#7383](https://github.com/cloudflare/workers-sdk/pull/7383) [`8af3365`](https://github.com/cloudflare/workers-sdk/commit/8af336504b48bbc1f9ce5f65e2f1e3d6384e267b) Thanks [@jonesphillip](https://github.com/jonesphillip)! - Added wrangler r2 domain get command

### Patch Changes

- [#7542](https://github.com/cloudflare/workers-sdk/pull/7542) [`f13c897`](https://github.com/cloudflare/workers-sdk/commit/f13c897769627f791e8485660566f3f59bcc57a3) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Always print deployment and placement ID in Cloudchamber commands

  Currently, Cloudchamber commands only print the full deployment ID when the deployment has an IPv4 address. This commit ensures the deployment ID and the placement ID are always printed to stdout. It also moves the printing of the IPv4 address (if one exists) to the same place as the IPv6 address so that they are printed together.

- [#6754](https://github.com/cloudflare/workers-sdk/pull/6754) [`0356d0a`](https://github.com/cloudflare/workers-sdk/commit/0356d0ac6a742a8e88e5efa87ebe085eeca07de2) Thanks [@bluwy](https://github.com/bluwy)! - refactor: move `@cloudflare/workers-shared` as dev dependency

- [#7478](https://github.com/cloudflare/workers-sdk/pull/7478) [`2e90efc`](https://github.com/cloudflare/workers-sdk/commit/2e90efcd52fe5da8f7916cd9f3e5dff5bc77bd1e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure that non-inherited fields are not removed when using an inferred named environment

  It is an error for the the user to provide an environment name that doesn't match any of the named environments in the Wrangler configuration.
  But if there are no named environments defined at all in the Wrangler configuration, we special case the top-level environment as though it was a named environment.
  Previously, when this happens, we would remove all the nonInheritable fields from the configuration (essentially all the bindings) leaving an incorrect configuration.
  Now we correctly generate a flattened named environment that has the nonInheritable fields, plus correctly applies any transformFn on inheritable fields.

- [#7524](https://github.com/cloudflare/workers-sdk/pull/7524) [`11f95f7`](https://github.com/cloudflare/workers-sdk/commit/11f95f790a4222ad2efcea943c88e5f6128765a0) Thanks [@gpanders](https://github.com/gpanders)! - Include response body in Cloudchamber API errors

- [#7427](https://github.com/cloudflare/workers-sdk/pull/7427) [`3bc0f28`](https://github.com/cloudflare/workers-sdk/commit/3bc0f2804bb64b5038dd7a1ca839e096f545196d) Thanks [@edmundhung](https://github.com/edmundhung)! - The `x-provision` experimental flag now identifies draft and inherit bindings by looking up the current binding settings.

  Draft bindings can then be provisioned (connected to new or existing KV, D1, or R2 resources) during `wrangler deploy`.

- Updated dependencies []:
  - miniflare@3.20241205.0

## 3.95.0

### Minor Changes

- [#7382](https://github.com/cloudflare/workers-sdk/pull/7382) [`e0b98fd`](https://github.com/cloudflare/workers-sdk/commit/e0b98fdb6eefffff16fc0624517cd9e5fce93c98) Thanks [@jonesphillip](https://github.com/jonesphillip)! - Added r2 bucket cors command to Wrangler including list, set, delete

## 3.94.0

### Minor Changes

- [#7229](https://github.com/cloudflare/workers-sdk/pull/7229) [`669d7ad`](https://github.com/cloudflare/workers-sdk/commit/669d7ad1e44c07cf74202c4d0fc244a9c50dec81) Thanks [@gabivlj](https://github.com/gabivlj)! - Introduce a new cloudchamber command `wrangler cloudchamber apply`, which will be used by customers to deploy container-apps

### Patch Changes

- [#7002](https://github.com/cloudflare/workers-sdk/pull/7002) [`d2447c6`](https://github.com/cloudflare/workers-sdk/commit/d2447c6c1ebcdebf0829519c3bc52bc2d30a4294) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: More helpful error messages when validating compatibility date

- [#7493](https://github.com/cloudflare/workers-sdk/pull/7493) [`4c140bc`](https://github.com/cloudflare/workers-sdk/commit/4c140bcb2b75a3dcf12240d66c22619af10503df) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: remove non-json output in json mode commands

  Fixes regressions in 3.93.0 where unwanted text (wrangler banner, telemetry notice) was printing in commands that should only output valid json.

- Updated dependencies [[`5449fe5`](https://github.com/cloudflare/workers-sdk/commit/5449fe54b15cf7c6dd12c385b0c8d2883c641b80)]:
  - @cloudflare/workers-shared@0.11.0
  - miniflare@3.20241205.0

## 3.93.0

### Minor Changes

- [#7291](https://github.com/cloudflare/workers-sdk/pull/7291) [`f5b9cd5`](https://github.com/cloudflare/workers-sdk/commit/f5b9cd52bc2ec42e17435c5ea0cd79b766ff76dd) Thanks [@edmundhung](https://github.com/edmundhung)! - Add anonymous telemetry to Wrangler commands

  For new users, Cloudflare will collect anonymous usage telemetry to guide and improve Wrangler's development. If you have already opted out of Wrangler's existing telemetry, this setting will still be respected.

  See our [data policy](https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/telemetry.md) for more details on what we collect and how to opt out if you wish.

- [#7448](https://github.com/cloudflare/workers-sdk/pull/7448) [`20a0f17`](https://github.com/cloudflare/workers-sdk/commit/20a0f17609f8f71997c14de9284dae217109e02a) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Allow Workers for Platforms scripts (scripts deployed with `--dispatch-namespace`) to bring along `assets`

- [#7445](https://github.com/cloudflare/workers-sdk/pull/7445) [`f4ae6ee`](https://github.com/cloudflare/workers-sdk/commit/f4ae6ee17a0bd487aa0680a0a7c0757256dee36d) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Support for `assets.experimental_serve_directly` with `wrangler dev`

### Patch Changes

- [#7256](https://github.com/cloudflare/workers-sdk/pull/7256) [`415e5b5`](https://github.com/cloudflare/workers-sdk/commit/415e5b58c752c75f9cfcea4a5acf189cb1861404) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Export unstable_readConfig function and Unstable_Config, Unstable_RawConfig, Unstable_RawEnvironment and Unstable_MiniflareWorkerOptions types from Wrangler.
  Overload unstable_getMiniflareWorkerOptions function to accept a config that has already been loaded.

- [#7431](https://github.com/cloudflare/workers-sdk/pull/7431) [`8f25ebe`](https://github.com/cloudflare/workers-sdk/commit/8f25ebe74d19237e85b6dada1eb34236add11d48) Thanks [@vicb](https://github.com/vicb)! - chore(wrangler): update unenv dependency version

  Pull in:

  - refactor(cloudflare): reimplement module:createRequire for latest workerd (unjs/unenv#351)
  - refactor: use node:events instead of relative path (unjs/unenv#354)
  - refactor(http, cloudflare): use unenv/ imports inside node:http (unjs/unenv#363)
  - refactor(node:process): set process.domain to undefined (unjs/unenv#367)

- [#7426](https://github.com/cloudflare/workers-sdk/pull/7426) [`b40d0ab`](https://github.com/cloudflare/workers-sdk/commit/b40d0ab4fdd3a03c06ebb7682e4eea0e561afe81) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: allow the asset directory to be omitted in Wrangler config for commands that don't need it

- [#7454](https://github.com/cloudflare/workers-sdk/pull/7454) [`f2045be`](https://github.com/cloudflare/workers-sdk/commit/f2045be9e689c2a919086904f3bd24f9e32baac9) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: Ensure that unstable type exports are all prefixed with `Unstable_` rather than just `Unstable`

- [#7461](https://github.com/cloudflare/workers-sdk/pull/7461) [`9ede45b`](https://github.com/cloudflare/workers-sdk/commit/9ede45b02b43284180c7b9bce2839543fcc3229a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: relax validation of unsafe configuration to allow an empty object

  The types, the default and the code in general support an empty object for this config setting.

  So it makes sense to avoid erroring when validating the config.

- [#7446](https://github.com/cloudflare/workers-sdk/pull/7446) [`9435af0`](https://github.com/cloudflare/workers-sdk/commit/9435af0b927a84adecf8d4f48093bf8df07561e9) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: make sure Wrangler doesn't create a `.wrangler` tmp dir in the `functions/` folder of a Pages project

  This regression was introduced in https://github.com/cloudflare/workers-sdk/pull/7415
  and this change fixes it by reverting that change.

- [#7385](https://github.com/cloudflare/workers-sdk/pull/7385) [`14a7bc6`](https://github.com/cloudflare/workers-sdk/commit/14a7bc659d70fbe11ed895ebe031ad3f46f8e995) Thanks [@edmundhung](https://github.com/edmundhung)! - The `x-provision` experimental flag now support inherit bindings in deploys

- [#7463](https://github.com/cloudflare/workers-sdk/pull/7463) [`073293f`](https://github.com/cloudflare/workers-sdk/commit/073293faad82f7dd0d95ece9727f13d1195f7b74) Thanks [@penalosa](https://github.com/penalosa)! - Clarify messaging around `wrangler versions` commands to reflect that they're stable (and have been since GA during birthday week)

- [#7436](https://github.com/cloudflare/workers-sdk/pull/7436) [`5e69799`](https://github.com/cloudflare/workers-sdk/commit/5e6979914a255d06830798c5167332b5165b048e) Thanks [@Ankcorn](https://github.com/Ankcorn)! - Relax type on observability.enabled to remove linting error for nested configurations

- [#7450](https://github.com/cloudflare/workers-sdk/pull/7450) [`8c873ed`](https://github.com/cloudflare/workers-sdk/commit/8c873edd9434e998f94ce54d56c2bc7494da5615) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure that version secrets commands do not write wrangler config warnings

- Updated dependencies [[`21a9e24`](https://github.com/cloudflare/workers-sdk/commit/21a9e24bc7cea1e7bf54a77568de98df9b7c8d03), [`f4ae6ee`](https://github.com/cloudflare/workers-sdk/commit/f4ae6ee17a0bd487aa0680a0a7c0757256dee36d)]:
  - miniflare@3.20241205.0
  - @cloudflare/workers-shared@0.10.0

## 3.92.0

### Minor Changes

- [#7251](https://github.com/cloudflare/workers-sdk/pull/7251) [`80a83bb`](https://github.com/cloudflare/workers-sdk/commit/80a83bb4708ea2e3d4b514d3ebc97aa40c14439c) Thanks [@penalosa](https://github.com/penalosa)! - Improve Wrangler's multiworker support to allow running multiple workers at once with one command. To try it out, pass multiple `-c` flags to Wrangler: i.e. `wrangler dev -c wrangler.toml -c ../other-worker/wrangler.toml`. The first config will be treated as the _primary_ worker and will be exposed over HTTP as usual (localhost:8787) while the rest will be treated as _secondary_ and will only be accessible via a service binding from the primary worker. Notably, these workers all run in the same runtime instance, which should improve reliability of multiworker dev and fix some bugs (RPC to cross worker Durable Objects, for instance).

- [#7130](https://github.com/cloudflare/workers-sdk/pull/7130) [`11338d0`](https://github.com/cloudflare/workers-sdk/commit/11338d08bba1a6d4bff04ecd8f6693940211064f) Thanks [@nickbabcock](https://github.com/nickbabcock)! - Update import resolution for files and package exports

  In an npm workspace environment, wrangler will now be able to successfully resolve package exports.

  Previously, wrangler would only be able to resolve modules in a relative `node_modules` directory and not the workspace root `node_modules` directory.

- [#7355](https://github.com/cloudflare/workers-sdk/pull/7355) [`5928e8c`](https://github.com/cloudflare/workers-sdk/commit/5928e8c0f2f31364208b8ec496307799ca93a7b3) Thanks [@emily-shen](https://github.com/emily-shen)! - feat: add `experimental_serve_directly` option to Workers with Assets

  Users can now specify whether their assets are served directly against HTTP requests or whether these requests always go to the Worker, which can then respond with asset retrieved by its assets binding.

### Patch Changes

- [#7326](https://github.com/cloudflare/workers-sdk/pull/7326) [`24c752e`](https://github.com/cloudflare/workers-sdk/commit/24c752ee482aac06e91fc9e60bcf1d9924d67390) Thanks [@OilyLime](https://github.com/OilyLime)! - Print wrangler.toml snippet when creating new Hyperdrive Config

- [#7272](https://github.com/cloudflare/workers-sdk/pull/7272) [`a3f56d1`](https://github.com/cloudflare/workers-sdk/commit/a3f56d1ed6aad7261cbbe29e907092158e8b0bc4) Thanks [@penalosa](https://github.com/penalosa)! - Make debug log for `.env` not found less scary

- [#7377](https://github.com/cloudflare/workers-sdk/pull/7377) [`6ecc74e`](https://github.com/cloudflare/workers-sdk/commit/6ecc74edf27bb1c6477a700fadebcf20e1b6cd68) Thanks [@edmundhung](https://github.com/edmundhung)! - The `x-provision` experimental flag now skips validation of KV, R2, and D1 IDs in the configuration file.

- [#7348](https://github.com/cloudflare/workers-sdk/pull/7348) [`4cd8b46`](https://github.com/cloudflare/workers-sdk/commit/4cd8b4613fa6f51cf07de845866d0a86091afde1) Thanks [@edmundhung](https://github.com/edmundhung)! - Added `x-provision` global option

  This experimental flag currently has no effect. More details will be shared as we roll out its functionality.

- [#7381](https://github.com/cloudflare/workers-sdk/pull/7381) [`22a4055`](https://github.com/cloudflare/workers-sdk/commit/22a4055585bc8271e2183392148ad72dabb448a1) Thanks [@penalosa](https://github.com/penalosa)! - Turn on `--x-registry` for Pages by default

- [#7360](https://github.com/cloudflare/workers-sdk/pull/7360) [`98d2725`](https://github.com/cloudflare/workers-sdk/commit/98d27250d2b37451e808b4aee623c3b4c4de5a20) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: allow running `wrangler types` when expected entrypoint doesn't exist

- Updated dependencies [[`ac87395`](https://github.com/cloudflare/workers-sdk/commit/ac873952cfca41c67ce7855a73c6d3a8b131be06), [`6b21919`](https://github.com/cloudflare/workers-sdk/commit/6b21919a3d8042afa0270c825bc119e9b58c0455), [`b3d2e7d`](https://github.com/cloudflare/workers-sdk/commit/b3d2e7dcee4358322f751b54a7b77d47f7b5ca78)]:
  - miniflare@3.20241106.2
  - @cloudflare/workers-shared@0.9.1

## 3.91.0

### Minor Changes

- [#7230](https://github.com/cloudflare/workers-sdk/pull/7230) [`6fe9533`](https://github.com/cloudflare/workers-sdk/commit/6fe9533897b61ae9ef6566b5d2bdf09698566c24) Thanks [@penalosa](https://github.com/penalosa)! - Turn on `wrangler.json(c)` support by default

  Wrangler now supports both JSON (`wrangler.json`) and TOML (`wrangler.toml`) for it's configuration file. The format of Wrangler's configuration file is exactly the same across both languages, except that the syntax is `JSON` rather than `TOML`. e.g.

  ```toml
  name = "worker-ts"
  main = "src/index.ts"
  compatibility_date = "2023-05-04"
  ```

  would be interpreted the same as the equivalent JSON

  ```json
  {
  	"name": "worker-ts",
  	"main": "src/index.ts",
  	"compatibility_date": "2023-05-04"
  }
  ```

- [#7330](https://github.com/cloudflare/workers-sdk/pull/7330) [`219109a`](https://github.com/cloudflare/workers-sdk/commit/219109aec71bbb40dc92c18f69a2d473e455f216) Thanks [@jonesphillip](https://github.com/jonesphillip)! - Added Oceania (oc) location hint as acceptable choice when creating an R2 bucket.

- [#7227](https://github.com/cloudflare/workers-sdk/pull/7227) [`02a0e1e`](https://github.com/cloudflare/workers-sdk/commit/02a0e1e186706eaec46048252068713f04698384) Thanks [@taylorlee](https://github.com/taylorlee)! - Add `preview_urls` toggle to `wrangler.toml`

  The current Preview URLs (beta) feature routes to version preview urls based on the status of the `workers_dev` config value. Beta users have requested the ability to enable deployment urls and preview urls separately on `workers.dev`, and the new `previews_enabled` field of the enable-subdomain API will allow that. This change separates the `workers_dev` and `preview_urls` behavior during `wrangler triggers deploy` and `wrangler versions upload`. `preview_urls` defaults to true, and does not implicitly depend on routes the way `workers_dev` does.

- [#7308](https://github.com/cloudflare/workers-sdk/pull/7308) [`1b1d01a`](https://github.com/cloudflare/workers-sdk/commit/1b1d01a5492fda28e6cfb116f99b81057d840fc5) Thanks [@gpanders](https://github.com/gpanders)! - Add a default image for cloudchamber create and modify commands

- [#7232](https://github.com/cloudflare/workers-sdk/pull/7232) [`7da76de`](https://github.com/cloudflare/workers-sdk/commit/7da76deec98360365dded46ba2bf90b14f27aacb) Thanks [@toddmantell](https://github.com/toddmantell)! - feat: implement queues info command

  This command allows users to get information on individual queues.

  To run this command use the queues info command with the name of a queue in the user's account.

  `wrangler queues info my-queue-name`

### Patch Changes

- [#7319](https://github.com/cloudflare/workers-sdk/pull/7319) [`5a2c93d`](https://github.com/cloudflare/workers-sdk/commit/5a2c93d111b4d18ced7001e6583d07384301907a) Thanks [@vicb](https://github.com/vicb)! - chore(wrangler): update unenv dependency version

  Pulls in the implementation of module.findSourceMap

- Updated dependencies [[`0d314ed`](https://github.com/cloudflare/workers-sdk/commit/0d314ed14145d50b8fd00fdae8b31fb043f4d31a), [`476e5df`](https://github.com/cloudflare/workers-sdk/commit/476e5df5d9f0a2aa3d713160994da3e2a752418e)]:
  - @cloudflare/workers-shared@0.9.0
  - miniflare@3.20241106.1

## 3.90.0

### Minor Changes

- [#7315](https://github.com/cloudflare/workers-sdk/pull/7315) [`31729ee`](https://github.com/cloudflare/workers-sdk/commit/31729ee63df0fbaf34787ab9e5a53f7180d0ec8c) Thanks [@G4brym](https://github.com/G4brym)! - Update local AI fetcher to forward method and url to upstream

### Patch Changes

- Updated dependencies [[`6ba5903`](https://github.com/cloudflare/workers-sdk/commit/6ba5903201de34cb3a8a5610fa11825279171a7e)]:
  - @cloudflare/workers-shared@0.8.0
  - miniflare@3.20241106.1

## 3.89.0

### Minor Changes

- [#7252](https://github.com/cloudflare/workers-sdk/pull/7252) [`97acf07`](https://github.com/cloudflare/workers-sdk/commit/97acf07b3e09192b71e81a722029d026a7198b8b) Thanks [@Maximo-Guk](https://github.com/Maximo-Guk)! - feat: Add production_branch and deployment_trigger to pages deploy detailed artifact for wrangler-action pages parity

- [#7263](https://github.com/cloudflare/workers-sdk/pull/7263) [`1b80dec`](https://github.com/cloudflare/workers-sdk/commit/1b80decfaf56c8782e49dad685c344288629b668) Thanks [@danielrs](https://github.com/danielrs)! - Fix wrangler pages deployment (list|tail) environment filtering.

### Patch Changes

- [#7314](https://github.com/cloudflare/workers-sdk/pull/7314) [`a30c805`](https://github.com/cloudflare/workers-sdk/commit/a30c8056621f44063082a81d06f10e723844059f) Thanks [@Ankcorn](https://github.com/Ankcorn)! - Fix observability.logs.enabled validation

- [#7285](https://github.com/cloudflare/workers-sdk/pull/7285) [`fa21312`](https://github.com/cloudflare/workers-sdk/commit/fa21312c6625680709e05547c13897bc1fa8c9d3) Thanks [@penalosa](https://github.com/penalosa)! - Rename `directory` to `projectRoot` and ensure it's relative to the `wrangler.toml`. This fixes a regression which meant that `.wrangler` temporary folders were inadvertently generated relative to `process.cwd()` rather than the location of the `wrangler.toml` file. It also renames `directory` to `projectRoot`, which affects the `unstable_startWorker() interface.

- Updated dependencies [[`563439b`](https://github.com/cloudflare/workers-sdk/commit/563439bd02c450921b28d721d36be5a70897690d)]:
  - miniflare@3.20241106.1

## 3.88.0

### Minor Changes

- [#7173](https://github.com/cloudflare/workers-sdk/pull/7173) [`b6cbfbd`](https://github.com/cloudflare/workers-sdk/commit/b6cbfbdd10dfbb732ec12a5c69bd4a74b07de8a0) Thanks [@Ankcorn](https://github.com/Ankcorn)! - Adds [observability.logs] settings to wrangler. This setting lets developers control the settings for logs as an independent dataset enabling more dataset types in the future. The most specific setting will win if any of the datasets are not enabled.

  It also adds the following setting to the logs config

  - `invocation_logs` - set to false to disable invocation logs. Defaults to true.

  ```toml
  [observability.logs]
  enabled = true
  invocation_logs = false
  ```

- [#7207](https://github.com/cloudflare/workers-sdk/pull/7207) [`edec415`](https://github.com/cloudflare/workers-sdk/commit/edec41591dcf37262d459568c0f454820b90dbaa) Thanks [@jonesphillip](https://github.com/jonesphillip)! - Added r2 bucket lifecycle command to Wrangler including list, add, remove, set

### Patch Changes

- [#7243](https://github.com/cloudflare/workers-sdk/pull/7243) [`941d411`](https://github.com/cloudflare/workers-sdk/commit/941d4110ca84510d235b72b3f98692e4188a7ad4) Thanks [@penalosa](https://github.com/penalosa)! - Include Version Preview URL in Wrangler's output file

- [#7038](https://github.com/cloudflare/workers-sdk/pull/7038) [`e2e6912`](https://github.com/cloudflare/workers-sdk/commit/e2e6912bcb7a1f6b7f8081b889a4e08be8a740a1) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: only show fetch warning if on old compatibility_date

  Now that we have the `allow_custom_ports` compatibility flag, we only need to show the fetch warnings when that flag is not enabled.

  Fixes https://github.com/cloudflare/workerd/issues/2955

- [#7216](https://github.com/cloudflare/workers-sdk/pull/7216) [`09e6e90`](https://github.com/cloudflare/workers-sdk/commit/09e6e905d9825d33b8e90acabb8ff7b962cc908b) Thanks [@vicb](https://github.com/vicb)! - chore(wrangler): update unenv dependency version

- [#7081](https://github.com/cloudflare/workers-sdk/pull/7081) [`b4a0e74`](https://github.com/cloudflare/workers-sdk/commit/b4a0e74680440084342477fc9373f9f76ab91c0b) Thanks [@penalosa](https://github.com/penalosa)! - Default the file based registry (`--x-registry`) to on. This should improve stability of multi-worker development

- Updated dependencies []:
  - miniflare@3.20241106.0

## 3.87.0

### Minor Changes

- [#7201](https://github.com/cloudflare/workers-sdk/pull/7201) [`beed72e`](https://github.com/cloudflare/workers-sdk/commit/beed72e7f3611c06ba777cd3a253a03a6eca2a17) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Tail Consumers are now supported for Workers with assets.

  You can now configure `tail_consumers` in conjunction with `assets` in your `wrangler.toml` file. Read more about [Static Assets](https://developers.cloudflare.com/workers/static-assets/) and [Tail Consumers](https://developers.cloudflare.com/workers/observability/logs/tail-workers/) in the documentation.

- [#7212](https://github.com/cloudflare/workers-sdk/pull/7212) [`837f2f5`](https://github.com/cloudflare/workers-sdk/commit/837f2f569bb300b93acc6fd22d96f11e468fa552) Thanks [@jonesphillip](https://github.com/jonesphillip)! - Added r2 bucket info command to Wrangler. Improved formatting of r2 bucket list output

### Patch Changes

- [#7210](https://github.com/cloudflare/workers-sdk/pull/7210) [`c12c0fe`](https://github.com/cloudflare/workers-sdk/commit/c12c0fed888421215c15af9755f895bcfd635d8c) Thanks [@taylorlee](https://github.com/taylorlee)! - Avoid an unnecessary GET request during `wrangler deploy`.

- [#7197](https://github.com/cloudflare/workers-sdk/pull/7197) [`4814455`](https://github.com/cloudflare/workers-sdk/commit/481445571735978b6af036254a82b3b9ca73f161) Thanks [@michelheusschen](https://github.com/michelheusschen)! - fix console output for `wrangler d1 migrations create`

- [#6795](https://github.com/cloudflare/workers-sdk/pull/6795) [`94f07ee`](https://github.com/cloudflare/workers-sdk/commit/94f07eec15bf48ab4792b9b39e960c5c92fbf517) Thanks [@benmccann](https://github.com/benmccann)! - chore: upgrade chokidar to v4

- [#7133](https://github.com/cloudflare/workers-sdk/pull/7133) [`c46e02d`](https://github.com/cloudflare/workers-sdk/commit/c46e02dfd7e951ccd8d33db87c00c3772c085487) Thanks [@gpanders](https://github.com/gpanders)! - Do not emit escape sequences when stdout is not a TTY

## 3.86.1

### Patch Changes

- [#7069](https://github.com/cloudflare/workers-sdk/pull/7069) [`b499b74`](https://github.com/cloudflare/workers-sdk/commit/b499b743e2720ca57e9f156f3e945a7d7afe98ac) Thanks [@penalosa](https://github.com/penalosa)! - Internal refactor to remove the non `--x-dev-env` flow from `wrangler dev`

## 3.86.0

### Minor Changes

- [#7154](https://github.com/cloudflare/workers-sdk/pull/7154) [`ef7c0b3`](https://github.com/cloudflare/workers-sdk/commit/ef7c0b3641925e2deceb7e5323f86b769de54405) Thanks [@jonesphillip](https://github.com/jonesphillip)! - Added the ability to enable, disable, and get r2.dev public access URLs for R2 buckets.

### Patch Changes

- [#7169](https://github.com/cloudflare/workers-sdk/pull/7169) [`9098a3b`](https://github.com/cloudflare/workers-sdk/commit/9098a3b03f82bbfb1fb8c8c531fafbfe26a49e59) Thanks [@penalosa](https://github.com/penalosa)! - Ensure `workerd` processes are cleaned up after address-in-use errors

- [#7172](https://github.com/cloudflare/workers-sdk/pull/7172) [`3dce388`](https://github.com/cloudflare/workers-sdk/commit/3dce3881bdaf373aa9b2e52483e340ab8193151c) Thanks [@penalosa](https://github.com/penalosa)! - Clarify dev registry messaging around locally connected services. The connection status of local service bindings & durable object bindings is now indicated by `connected` or `not connected` next to their entry in the bindings summary. For more details, refer to https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/#local-development

- [#7193](https://github.com/cloudflare/workers-sdk/pull/7193) [`ad51d1d`](https://github.com/cloudflare/workers-sdk/commit/ad51d1d77483bf0b4dc73fd392f5cdefe4ddf5d8) Thanks [@sdnts](https://github.com/sdnts)! - Output suggested wrangler.toml changes after creating an R2 bucket

- [#7191](https://github.com/cloudflare/workers-sdk/pull/7191) [`1d5bc6d`](https://github.com/cloudflare/workers-sdk/commit/1d5bc6d3530e98db117af3f6b16b43ff6c069f94) Thanks [@sdnts](https://github.com/sdnts)! - Output suggested wrangler.toml changes after creating a Queue

- Updated dependencies [[`1db7846`](https://github.com/cloudflare/workers-sdk/commit/1db7846ec5c356f6b59cddf5f48b16b3e7c73d66), [`08c6580`](https://github.com/cloudflare/workers-sdk/commit/08c6580494e702373d17ff7485988a8fae9af59e)]:
  - miniflare@3.20241106.0
  - @cloudflare/workers-shared@0.7.1

## 3.85.0

### Minor Changes

- [#7105](https://github.com/cloudflare/workers-sdk/pull/7105) [`a5f1779`](https://github.com/cloudflare/workers-sdk/commit/a5f177945cc512e1e4dc889c09efa67e5af8ff2b) Thanks [@jonesphillip](https://github.com/jonesphillip)! - Added the ability to list, add, remove, and update R2 bucket custom domains.

- [#7132](https://github.com/cloudflare/workers-sdk/pull/7132) [`89f6274`](https://github.com/cloudflare/workers-sdk/commit/89f627426bc30b5c76039c9e78a9aab14dcd40c9) Thanks [@gabivlj](https://github.com/gabivlj)! - Event messages are capitalized, images of wrong architectures properly show the error in `cloudchamber create`
  When a new "health" enum is introduced, `wrangler cloudchamber list` won't crash anymore.
  Update Cloudchamber schemas.

- [#7121](https://github.com/cloudflare/workers-sdk/pull/7121) [`2278616`](https://github.com/cloudflare/workers-sdk/commit/2278616b517e17dede77a675d5d2dc6847489f50) Thanks [@bruxodasilva](https://github.com/bruxodasilva)! - Added pause and resume commands to manage Workflows and hidded unimplemented delete command

### Patch Changes

- [#7134](https://github.com/cloudflare/workers-sdk/pull/7134) [`3ee1353`](https://github.com/cloudflare/workers-sdk/commit/3ee1353d317c0e137a14f3091b32eecd575cc7a4) Thanks [@cmackenzie1](https://github.com/cmackenzie1)! - Change Pipelines to use name instead of ID

- [#7020](https://github.com/cloudflare/workers-sdk/pull/7020) [`e1d2fd6`](https://github.com/cloudflare/workers-sdk/commit/e1d2fd668678dadcd46a1a9ca7da17e1627be807) Thanks [@KianNH](https://github.com/KianNH)! - chore: move printWranglerBanner for secret delete into handler

- [#7150](https://github.com/cloudflare/workers-sdk/pull/7150) [`6380d86`](https://github.com/cloudflare/workers-sdk/commit/6380d864d6c771f3cc81d6a3cd00a8559a6d4839) Thanks [@emily-shen](https://github.com/emily-shen)! - refactor: improve login/logout/whoami setup with the new internal registration utils

- [#6756](https://github.com/cloudflare/workers-sdk/pull/6756) [`49ef163`](https://github.com/cloudflare/workers-sdk/commit/49ef163e5d91ac5123cd6ccc29b5f98e0c92d7df) Thanks [@WalshyDev](https://github.com/WalshyDev)! - chore: disable wrangler.toml warnings when doing `wrangler login` & `wrangler logout`

- [#7164](https://github.com/cloudflare/workers-sdk/pull/7164) [`1bd4885`](https://github.com/cloudflare/workers-sdk/commit/1bd4885b5dcba981c0ccf13aa1228262b9101783) Thanks [@penalosa](https://github.com/penalosa)! - Fix `--test-scheduled` with custom builds & `--x-dev-env`

## 3.84.1

### Patch Changes

- [#7141](https://github.com/cloudflare/workers-sdk/pull/7141) [`d938bb3`](https://github.com/cloudflare/workers-sdk/commit/d938bb395d77e2be9ab708eb4ace722fc39153e8) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: throw a better error if there is an "ASSETS" user binding in a Pages projects

- [#7124](https://github.com/cloudflare/workers-sdk/pull/7124) [`f8ebdd1`](https://github.com/cloudflare/workers-sdk/commit/f8ebdd1b2ba7cdc30a17c19dc66aed064213b2a6) Thanks [@skepticfx](https://github.com/skepticfx)! - fix: Modify Cloudchamber deployment labels in interactive mode

## 3.84.0

### Minor Changes

- [#6999](https://github.com/cloudflare/workers-sdk/pull/6999) [`0111edb`](https://github.com/cloudflare/workers-sdk/commit/0111edb9da466184885085be5e755ceb4970a486) Thanks [@garvit-gupta](https://github.com/garvit-gupta)! - docs: Vectorize GA Announcement Banner

- [#6916](https://github.com/cloudflare/workers-sdk/pull/6916) [`a33a133`](https://github.com/cloudflare/workers-sdk/commit/a33a133f884741d347f85f059631ae6461c46fdd) Thanks [@garrettgu10](https://github.com/garrettgu10)! - Local development now supports Vectorize bindings

- [#7004](https://github.com/cloudflare/workers-sdk/pull/7004) [`15ef013`](https://github.com/cloudflare/workers-sdk/commit/15ef013f1bd006915d01477e9e65f8ac51e7dce9) Thanks [@garvit-gupta](https://github.com/garvit-gupta)! - feat: Enable Vectorize query by id via Wrangler

- [#7092](https://github.com/cloudflare/workers-sdk/pull/7092) [`038fdd9`](https://github.com/cloudflare/workers-sdk/commit/038fdd97aaab9db3b6a76cd0e0d9cf7a786f9ac8) Thanks [@jonesphillip](https://github.com/jonesphillip)! - Added location hint option for the Wrangler R2 bucket create command

- [#7024](https://github.com/cloudflare/workers-sdk/pull/7024) [`bd66d51`](https://github.com/cloudflare/workers-sdk/commit/bd66d511a90dd7a635ec94e95f806be7de569212) Thanks [@xortive](https://github.com/xortive)! - feature: allow using a connection string when updating hyperdrive configs

  both `hyperdrive create` and `hyperdrive update` now support updating configs with connection strings.

### Patch Changes

- [#7091](https://github.com/cloudflare/workers-sdk/pull/7091) [`68a2a84`](https://github.com/cloudflare/workers-sdk/commit/68a2a8460375cfa0fba8c7c7384b0168e5e4415d) Thanks [@taylorlee](https://github.com/taylorlee)! - fix: synchronize observability settings during `wrangler versions deploy`

  When running `wrangler versions deploy`, Wrangler will now update `observability` settings in addition to `logpush` and `tail_consumers`. Unlike `wrangler deploy`, it will not disable observability when `observability` is undefined in `wrangler.toml`.

- [#7080](https://github.com/cloudflare/workers-sdk/pull/7080) [`924ec18`](https://github.com/cloudflare/workers-sdk/commit/924ec18c249f49700d070e725be675fd5f99259b) Thanks [@vicb](https://github.com/vicb)! - chore(wrangler): update unenv dependency version

- [#7097](https://github.com/cloudflare/workers-sdk/pull/7097) [`8ca4b32`](https://github.com/cloudflare/workers-sdk/commit/8ca4b327443c38df55236509e2a782c6496ba89d) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: remove deprecation warnings for `wrangler init`

  We will not be removing `wrangler init` (it just delegates to create-cloudflare now). These warnings were causing confusion for users as it `wrangler init` is still recommended in many places.

- [#7073](https://github.com/cloudflare/workers-sdk/pull/7073) [`656a444`](https://github.com/cloudflare/workers-sdk/commit/656a444fc7d363c1b7154fdf73eed0a81b003882) Thanks [@penalosa](https://github.com/penalosa)! - Internal refactor to remove `es-module-lexer` and support `wrangler types` for Workers with Durable Objects & JSX

- [#7024](https://github.com/cloudflare/workers-sdk/pull/7024) [`bd66d51`](https://github.com/cloudflare/workers-sdk/commit/bd66d511a90dd7a635ec94e95f806be7de569212) Thanks [@xortive](https://github.com/xortive)! - fix: make individual parameters work for `wrangler hyperdrive create` when not using HoA

  `wrangler hyperdrive create` individual parameters were not setting the database name correctly when calling the api.

- [#7024](https://github.com/cloudflare/workers-sdk/pull/7024) [`bd66d51`](https://github.com/cloudflare/workers-sdk/commit/bd66d511a90dd7a635ec94e95f806be7de569212) Thanks [@xortive](https://github.com/xortive)! - refactor: use same param parsing code for `wrangler hyperdrive create` and `wrangler hyperdrive update`

  ensures that going forward, both commands support the same features and have the same names for config flags

## 3.83.0

### Minor Changes

- [#7000](https://github.com/cloudflare/workers-sdk/pull/7000) [`1de309b`](https://github.com/cloudflare/workers-sdk/commit/1de309ba2222d7a73cefacef8d3eb60e8afdf5b4) Thanks [@jkoe-cf](https://github.com/jkoe-cf)! - feature: allowing users to specify a description when creating an event notification rule

### Patch Changes

- [#7011](https://github.com/cloudflare/workers-sdk/pull/7011) [`cef32c8`](https://github.com/cloudflare/workers-sdk/commit/cef32c88ee75a84267c1007608c042deb220a30b) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Correctly apply Durable Object migrations for namespaced scripts

- [#7067](https://github.com/cloudflare/workers-sdk/pull/7067) [`4aa35c5`](https://github.com/cloudflare/workers-sdk/commit/4aa35c562f976e59016f395af208d05bbab3e408) Thanks [@LuisDuarte1](https://github.com/LuisDuarte1)! - Change trigger command to comply with the current workflows endpoint.

  This also adds an id option to allow users to optionally customize the new instance id.

- [#7082](https://github.com/cloudflare/workers-sdk/pull/7082) [`3f1d79c`](https://github.com/cloudflare/workers-sdk/commit/3f1d79c690e123ffb23cc22db64c07030fb3eb46) Thanks [@LuisDuarte1](https://github.com/LuisDuarte1)! - Change to new terminate instance workflow endpoint

- [#7036](https://github.com/cloudflare/workers-sdk/pull/7036) [`e7ea600`](https://github.com/cloudflare/workers-sdk/commit/e7ea6005c1f283bbdfe7a6803d41403e5ebc13e5) Thanks [@penalosa](https://github.com/penalosa)! - Reduce KV bulk upload bucket size to 1000 (from the previous 5000)

- [#7068](https://github.com/cloudflare/workers-sdk/pull/7068) [`a2afcf1`](https://github.com/cloudflare/workers-sdk/commit/a2afcf13ff4b6a9f72fdca108b3c7e493185adf6) Thanks [@RamIdeas](https://github.com/RamIdeas)! - log warning of Workflows open-beta status when running deploying a Worker that contains a Workflow binding

- [#7065](https://github.com/cloudflare/workers-sdk/pull/7065) [`b219296`](https://github.com/cloudflare/workers-sdk/commit/b2192965e50602f8148c8bd9a6f10fdb059aefd3) Thanks [@penalosa](https://github.com/penalosa)! - Internal refactor to remove React/ink from all non-`wrangler dev` flows

- [#7064](https://github.com/cloudflare/workers-sdk/pull/7064) [`a90980c`](https://github.com/cloudflare/workers-sdk/commit/a90980cadafb51c3ff60404d832bd11fc2b4e18b) Thanks [@penalosa](https://github.com/penalosa)! - Fix `wrangler dev --remote --show-interactive-dev-session=false` by only enabling hotkeys after account selection if hotkeys were previously enabled

- [#7045](https://github.com/cloudflare/workers-sdk/pull/7045) [`5ef6231`](https://github.com/cloudflare/workers-sdk/commit/5ef6231a5cefbaaef123e6e8ee899fb81fc69e3e) Thanks [@RamIdeas](https://github.com/RamIdeas)! - Add preliminary support for Workflows in wrangler dev

- [#7075](https://github.com/cloudflare/workers-sdk/pull/7075) [`80e5bc6`](https://github.com/cloudflare/workers-sdk/commit/80e5bc6887965a35ca1ab2794e4e4a96c0ef7a1e) Thanks [@LuisDuarte1](https://github.com/LuisDuarte1)! - Fix params serialization when send the trigger workflow API

  Previously, wrangler did not parse the params sending it as a string to workflow's services.

- Updated dependencies [[`760e43f`](https://github.com/cloudflare/workers-sdk/commit/760e43ffa197597de5625b96bc91376161f5027a), [`8dc2b7d`](https://github.com/cloudflare/workers-sdk/commit/8dc2b7d739239411ac29e419c22d22c291777042), [`5ef6231`](https://github.com/cloudflare/workers-sdk/commit/5ef6231a5cefbaaef123e6e8ee899fb81fc69e3e)]:
  - miniflare@3.20241022.0
  - @cloudflare/workers-shared@0.7.0

## 3.82.0

### Minor Changes

- [#6945](https://github.com/cloudflare/workers-sdk/pull/6945) [`6b97353`](https://github.com/cloudflare/workers-sdk/commit/6b9735389fcb57dd8abb778439dd5e11f593b264) Thanks [@bthwaites](https://github.com/bthwaites)! - Add jurisdiction option to R2 event notification wrangler actions

### Patch Changes

- [#5737](https://github.com/cloudflare/workers-sdk/pull/5737) [`9bf51d6`](https://github.com/cloudflare/workers-sdk/commit/9bf51d656f5c7cd6ef744ebc1cebe85b29f05187) Thanks [@penalosa](https://github.com/penalosa)! - Validate duplicate bindings across all binding types

- [#7010](https://github.com/cloudflare/workers-sdk/pull/7010) [`1f6ff8b`](https://github.com/cloudflare/workers-sdk/commit/1f6ff8b696671cd1f7918c0549cc7e6660a71e5b) Thanks [@vicb](https://github.com/vicb)! - chore: update unenv dependency version

- [#7012](https://github.com/cloudflare/workers-sdk/pull/7012) [`244aa57`](https://github.com/cloudflare/workers-sdk/commit/244aa57a9f38b9dedbae6d4bb3949dd63840c82c) Thanks [@RamIdeas](https://github.com/RamIdeas)! - Add support for Workflow bindings (in deployments, not yet in local dev)

  To bind to a workflow, add a `workflows` section in your wrangler.toml:

  ```toml
  [[workflows]]
  binding = "WORKFLOW"
  name = "my-workflow"
  class_name = "MyDemoWorkflow"
  ```

  and export an entrypoint (e.g. `MyDemoWorkflow`) in your script:

  ```typescript
  import { WorkflowEntrypoint } from "cloudflare:workers";

  export class MyDemoWorkflow extends WorkflowEntrypoint<Env, Params> {...}
  ```

- [#7039](https://github.com/cloudflare/workers-sdk/pull/7039) [`e44f496`](https://github.com/cloudflare/workers-sdk/commit/e44f496a84ba1c4c87abd5ea6302735cf84d525f) Thanks [@penalosa](https://github.com/penalosa)! - Only show dev registry connection status in local dev

- [#7037](https://github.com/cloudflare/workers-sdk/pull/7037) [`e1b93dc`](https://github.com/cloudflare/workers-sdk/commit/e1b93dcf6fc8b707d2d12b9e1a76e20f7450f025) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: ask for confirmation before creating a new Worker when uploading secrets

  Previously, `wrangler secret put KEY --name non-existent-worker` would automatically create a new Worker with the name `non-existent-worker`. This fix asks for confirmation before doing so (if running in an interactive context). Behaviour in non-interactive/CI contexts should be unchanged.

- [#7015](https://github.com/cloudflare/workers-sdk/pull/7015) [`48152d6`](https://github.com/cloudflare/workers-sdk/commit/48152d69ee1440764b99e1d9b17656aaa1c1b20e) Thanks [@RamIdeas](https://github.com/RamIdeas)! - add `wrangler workflows ...` commands

- [#7041](https://github.com/cloudflare/workers-sdk/pull/7041) [`045787b`](https://github.com/cloudflare/workers-sdk/commit/045787bc435dd84c3554adecc9ae8ddaf8a7a1ce) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Show `wrangler pages dev --proxy` warning

  On Node.js 17+, wrangler will default to fetching only the IPv6 address. With these changes we warn users that the process listening on the port specified via `--proxy` should be configured for IPv6.

- [#7018](https://github.com/cloudflare/workers-sdk/pull/7018) [`127615a`](https://github.com/cloudflare/workers-sdk/commit/127615afc29c95fa602d3ca63611fff2848556c1) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: log successful runs of `d1 execute` in local

- [#6970](https://github.com/cloudflare/workers-sdk/pull/6970) [`a8ca700`](https://github.com/cloudflare/workers-sdk/commit/a8ca7005d09533f76b67c571859aa4c19519bec4) Thanks [@oliy](https://github.com/oliy)! - Add HTTP authentication options for Workers Pipelines

- [#7005](https://github.com/cloudflare/workers-sdk/pull/7005) [`6131ef5`](https://github.com/cloudflare/workers-sdk/commit/6131ef5a3d166176b98f2f2d4e8710c980ba6843) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: prevent users from passing multiple arguments to non array options

- [#7046](https://github.com/cloudflare/workers-sdk/pull/7046) [`f9d5fdb`](https://github.com/cloudflare/workers-sdk/commit/f9d5fdb0fdb4d0ed52264d64938d55eddd82ed8d) Thanks [@oliy](https://github.com/oliy)! - Minor change to 3rd party API shape for Workers Pipelines

- [#6972](https://github.com/cloudflare/workers-sdk/pull/6972) [`c794935`](https://github.com/cloudflare/workers-sdk/commit/c794935143e98af1829682fb4f34dec6efa7077a) Thanks [@penalosa](https://github.com/penalosa)! - Add ` (local)` indicator to bindings using local data

- Updated dependencies [[`809193e`](https://github.com/cloudflare/workers-sdk/commit/809193e05ad80c32086acf18646d0bd436cf2bfd)]:
  - miniflare@3.20241018.0

## 3.81.0

### Minor Changes

- [#6990](https://github.com/cloudflare/workers-sdk/pull/6990) [`586c253`](https://github.com/cloudflare/workers-sdk/commit/586c253f7de36360cab275cb1ebf9a2373fd4f4c) Thanks [@courtney-sims](https://github.com/courtney-sims)! - feat: Adds new detailed pages deployment output type

### Patch Changes

- [#6963](https://github.com/cloudflare/workers-sdk/pull/6963) [`a5ac45d`](https://github.com/cloudflare/workers-sdk/commit/a5ac45d7d5aa7a6b82de18a8cf14e6eabdd22e9e) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: make `wrangler dev --remote` respect wrangler.toml's `account_id` property.

  This was a regression in the `--x-dev-env` flow recently turned on by default.

- [#6996](https://github.com/cloudflare/workers-sdk/pull/6996) [`b8ab809`](https://github.com/cloudflare/workers-sdk/commit/b8ab8093b9011b5d7d47bcd31fa69cefa6c8fe2a) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: improve error messaging when accidentally using Workers commands in Pages project

  If we detect a Workers command used with a Pages project (i.e. wrangler.toml contains `pages_output_build_dir`), error with Pages version of command rather than "missing entry-point" etc.

## 3.80.5

### Patch Changes

- Updated dependencies [[`5761020`](https://github.com/cloudflare/workers-sdk/commit/5761020cb41270ce872ad6c555b263597949c06d), [`7859a04`](https://github.com/cloudflare/workers-sdk/commit/7859a04bcd4b2f1cafe67c371bd236acaf7a2d91)]:
  - miniflare@3.20241011.0

## 3.80.4

### Patch Changes

- [#6937](https://github.com/cloudflare/workers-sdk/pull/6937) [`51aedd4`](https://github.com/cloudflare/workers-sdk/commit/51aedd4333cce9ffa4f6834cdf19e22148dab7e9) Thanks [@lrapoport-cf](https://github.com/lrapoport-cf)! - fix: show help when kv commands are run without parameters

- Updated dependencies [[`c863183`](https://github.com/cloudflare/workers-sdk/commit/c86318354f1a6c0f5c096d6b2a884de740552a19), [`fd43068`](https://github.com/cloudflare/workers-sdk/commit/fd430687ec1431be6c3af1b7420278b636c36e59)]:
  - miniflare@3.20241004.0
  - @cloudflare/workers-shared@0.6.0

## 3.80.3

### Patch Changes

- [#6927](https://github.com/cloudflare/workers-sdk/pull/6927) [`2af75ed`](https://github.com/cloudflare/workers-sdk/commit/2af75edb3c0722c04793c74f46aa099f4a3f27a9) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: respect `CLOUDFLARE_ACCOUNT_ID` with `wrangler pages project` commands

  Fixes [#4947](https://github.com/cloudflare/workers-sdk/issues/4947)

- [#6894](https://github.com/cloudflare/workers-sdk/pull/6894) [`eaf71b8`](https://github.com/cloudflare/workers-sdk/commit/eaf71b86cc5650cffb54c942704ce3dd1b5ed6a7) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: improve the rendering of build errors when bundling

- [#6920](https://github.com/cloudflare/workers-sdk/pull/6920) [`2e64968`](https://github.com/cloudflare/workers-sdk/commit/2e649686c259c639701a62e754c53448cb694dfc) Thanks [@vicb](https://github.com/vicb)! - chore: update unenv dependency version

  Pulls in [feat(node/net): implement Server mock](https://github.com/unjs/unenv/pull/316).

- [#6932](https://github.com/cloudflare/workers-sdk/pull/6932) [`4c6aad0`](https://github.com/cloudflare/workers-sdk/commit/4c6aad05b919a56484d13e4a49b861dcafbc0a2c) Thanks [@vicb](https://github.com/vicb)! - fix: allow `require`ing unenv aliased packages

  Before this PR `require`ing packages aliased in unenv would fail.
  That's because `require` would load the mjs file.

  This PR adds wraps the mjs file in a virtual ES module to allow `require`ing it.

## 3.80.2

### Patch Changes

- [#6923](https://github.com/cloudflare/workers-sdk/pull/6923) [`1320f20`](https://github.com/cloudflare/workers-sdk/commit/1320f20b38d7b4623fe21d38118bdc9fb8514a99) Thanks [@andyjessop](https://github.com/andyjessop)! - chore: adds eslint-disable for ESLint error on empty typescript interface in workers-configuration.d.ts

## 3.80.1

### Patch Changes

- [#6908](https://github.com/cloudflare/workers-sdk/pull/6908) [`d696850`](https://github.com/cloudflare/workers-sdk/commit/d6968507b7eab36abdc4d6c2ffe183788857d08c) Thanks [@penalosa](https://github.com/penalosa)! - fix: debounce restarting worker on assets dir file changes when `--x-dev-env` is enabled.

- [#6902](https://github.com/cloudflare/workers-sdk/pull/6902) [`dc92af2`](https://github.com/cloudflare/workers-sdk/commit/dc92af28c572e3f7a03b84afd53f10a40ee2a5f8) Thanks [@threepointone](https://github.com/threepointone)! - fix: enable esbuild's keepNames: true to set .name on functions/classes

- [#6909](https://github.com/cloudflare/workers-sdk/pull/6909) [`82180a7`](https://github.com/cloudflare/workers-sdk/commit/82180a7a7680028f2ea24ae8b1c8479d39627826) Thanks [@penalosa](https://github.com/penalosa)! - fix: Various fixes for logging in `--x-dev-env`, primarily to ensure the hotkeys don't wipe useful output and are cleaned up correctly

- [#6903](https://github.com/cloudflare/workers-sdk/pull/6903) [`54924a4`](https://github.com/cloudflare/workers-sdk/commit/54924a430354c0e427770ee4289217660141c72e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure that `alias` config gets passed through to the bundler when using new `--x-dev-env`

  Fixes #6898

- [#6911](https://github.com/cloudflare/workers-sdk/pull/6911) [`30b7328`](https://github.com/cloudflare/workers-sdk/commit/30b7328073c86ff9adebd594015bca6844da7163) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: infer experimentalJsonConfig from file extension

  Fixes [#5768](https://github.com/cloudflare/workers-sdk/issues/5768) - issue with vitest and Pages projects with wrangler.toml

- Updated dependencies [[`5c50949`](https://github.com/cloudflare/workers-sdk/commit/5c509494807a1c0418be83c47a459ec80126848e)]:
  - miniflare@3.20240925.1

## 3.80.0

### Minor Changes

- [#6408](https://github.com/cloudflare/workers-sdk/pull/6408) [`3fa846e`](https://github.com/cloudflare/workers-sdk/commit/3fa846ec205a1f4e91bc1f69640dfd6e0a7b6a77) Thanks [@RamIdeas](https://github.com/RamIdeas)! - feat: update the `--experimental-dev-env` (shorthand: `--x-dev-env`) flag to on-by-default

  If you experience any issues, you can disable the flag with `--x-dev-env=false`. Please also let us know by opening an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose.

### Patch Changes

- [#6854](https://github.com/cloudflare/workers-sdk/pull/6854) [`04a8fed`](https://github.com/cloudflare/workers-sdk/commit/04a8feda8ee1e855ac9935b2395db4eed20b99b7) Thanks [@penalosa](https://github.com/penalosa)! - chore: Include serialised `FormData` in debug logs

- [#6879](https://github.com/cloudflare/workers-sdk/pull/6879) [`b27d8cb`](https://github.com/cloudflare/workers-sdk/commit/b27d8cbad4d2bcf435e7ac87891b17db1997cd4e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: the docs command should not crash if given search terms

  Fixes a regression accidentally introduced by #3735.

- [#6873](https://github.com/cloudflare/workers-sdk/pull/6873) [`b123f43`](https://github.com/cloudflare/workers-sdk/commit/b123f43c6946fa97f49bc10532c924b9c58548b6) Thanks [@zwily](https://github.com/zwily)! - fix: reduce logging noise during wrangler dev with static assets

  Updates to static assets are accessible by passing in --log-level="debug" but otherwise hidden.

- [#6881](https://github.com/cloudflare/workers-sdk/pull/6881) [`7ca37bc`](https://github.com/cloudflare/workers-sdk/commit/7ca37bcbb274e88709fc14aea6f62c003ddc1b92) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: custom builds outputting files in assets watched directory no longer cause the custom build to run again in an infinite loop

- [#6872](https://github.com/cloudflare/workers-sdk/pull/6872) [`b2d094e`](https://github.com/cloudflare/workers-sdk/commit/b2d094e52b519decf8fdef1bb8dcd42d3e4ac2ad) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: render a helpful build error if a Service Worker mode Worker has imports

  A common mistake is to forget to export from the entry-point of a Worker, which causes
  Wrangler to infer that we are in "Service Worker" mode.

  In this mode, imports to external modules are not allowed.
  Currently this only fails at runtime, because our esbuild step converts these imports to an internal `__require()` call that throws an error.
  The error message is misleading and does not help the user identify the cause of the problem.
  This is particularly tricky where the external imports are added by a library or our own node.js polyfills.

  Fixes #6648

- [#6792](https://github.com/cloudflare/workers-sdk/pull/6792) [`27e8385`](https://github.com/cloudflare/workers-sdk/commit/27e8385167a4ef6eff9bb91cf0203184fbd16915) Thanks [@penalosa](https://github.com/penalosa)! - fix: Handle more module declaration cases

- [#6838](https://github.com/cloudflare/workers-sdk/pull/6838) [`7dbd0c8`](https://github.com/cloudflare/workers-sdk/commit/7dbd0c82a52ba772f46081ccd4b39d59b1f4c8bf) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Improve static asset upload messaging

## 3.79.0

### Minor Changes

- [#6801](https://github.com/cloudflare/workers-sdk/pull/6801) [`6009bb4`](https://github.com/cloudflare/workers-sdk/commit/6009bb44185e6a8a464528c945ce5a47eb992837) Thanks [@RamIdeas](https://github.com/RamIdeas)! - feat: implement retries within `wrangler deploy` and `wrangler versions upload` to workaround spotty network connections and service flakes

### Patch Changes

- [#6870](https://github.com/cloudflare/workers-sdk/pull/6870) [`dc9039a`](https://github.com/cloudflare/workers-sdk/commit/dc9039a36f2e526a9a224a523fa6ebcdd42a9223) Thanks [@penalosa](https://github.com/penalosa)! - fix: Include `workerd` in the external dependecies of Wrangler to fix local builds.

- [#6866](https://github.com/cloudflare/workers-sdk/pull/6866) [`c75b0d9`](https://github.com/cloudflare/workers-sdk/commit/c75b0d9fec6cc6769b5f35a9455bb06588a68bbf) Thanks [@zwily](https://github.com/zwily)! - fix: debounce restarting worker on assets dir file changes

## 3.78.12

### Patch Changes

- [#6840](https://github.com/cloudflare/workers-sdk/pull/6840) [`5bfb75d`](https://github.com/cloudflare/workers-sdk/commit/5bfb75df8a81fc42f0eecd00fed5b84e5fab88d7) Thanks [@a-robinson](https://github.com/a-robinson)! - chore: update warning in `wrangler dev --remote` when using Queues to not mention beta status

## 3.78.11

### Patch Changes

- [#6819](https://github.com/cloudflare/workers-sdk/pull/6819) [`7ede181`](https://github.com/cloudflare/workers-sdk/commit/7ede1811376e4c08b9aba79c84b90ca2942ee87e) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Validate `[routes]` on configuration file changes

## 3.78.10

### Patch Changes

- [#6824](https://github.com/cloudflare/workers-sdk/pull/6824) [`1c58a74`](https://github.com/cloudflare/workers-sdk/commit/1c58a7470757508e64003d05c76d9deb7f223763) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: tidy up error messaging for unexpected use of Node.js APIs

  Fixes #6822

- Updated dependencies [[`5e2e62c`](https://github.com/cloudflare/workers-sdk/commit/5e2e62c165166819c63998ad0c7caaaf57d7b988), [`1c58a74`](https://github.com/cloudflare/workers-sdk/commit/1c58a7470757508e64003d05c76d9deb7f223763)]:
  - miniflare@3.20240925.0

## 3.78.9

### Patch Changes

- [#6753](https://github.com/cloudflare/workers-sdk/pull/6753) [`4e33f2c`](https://github.com/cloudflare/workers-sdk/commit/4e33f2cdc1d9ab59fdbd6fcc162632c91da9b21b) Thanks [@bluwy](https://github.com/bluwy)! - refactor: prevent bundling entire `package.json` in built code

- [#6812](https://github.com/cloudflare/workers-sdk/pull/6812) [`f700d37`](https://github.com/cloudflare/workers-sdk/commit/f700d3704a4fca98f8c74549ae849dea8cc1013b) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Validate additional config properties for `[observability]`

- [#6751](https://github.com/cloudflare/workers-sdk/pull/6751) [`638a550`](https://github.com/cloudflare/workers-sdk/commit/638a55063b5b74ad30dfe98f8ee2e23e86f2c25a) Thanks [@bluwy](https://github.com/bluwy)! - refactor: simplify date calculation and remove date-fns dependency

- [#6809](https://github.com/cloudflare/workers-sdk/pull/6809) [`28cb0d7`](https://github.com/cloudflare/workers-sdk/commit/28cb0d759e5a0863b92576bbec0df3305806e4aa) Thanks [@smellercf](https://github.com/smellercf)! - fix: Remove Beta tag from r2 event notification wrangler command descriptions

- [#6802](https://github.com/cloudflare/workers-sdk/pull/6802) [`17eb8a9`](https://github.com/cloudflare/workers-sdk/commit/17eb8a9f9e477fe064e5b0e7e716ba8b8ce0cccc) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - chore: rename `experimental_assets` to `assets`

- [#6781](https://github.com/cloudflare/workers-sdk/pull/6781) [`0792fa0`](https://github.com/cloudflare/workers-sdk/commit/0792fa08fbda89d282b87be86cd05f961ca38df1) Thanks [@mikenomitch](https://github.com/mikenomitch)! - chore: tweaks warning when using node_compat

## 3.78.8

### Patch Changes

- [#6791](https://github.com/cloudflare/workers-sdk/pull/6791) [`74d719f`](https://github.com/cloudflare/workers-sdk/commit/74d719fb8d2ce1e877b3c70da2a495386084d892) Thanks [@penalosa](https://github.com/penalosa)! - fix: Add missing binding to `init --from-dash`

- [#6728](https://github.com/cloudflare/workers-sdk/pull/6728) [`1ca313f`](https://github.com/cloudflare/workers-sdk/commit/1ca313f2041688cd13e25f0817e3b72dfc930bac) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: remove filepath encoding on asset upload and handle sometimes-encoded characters

  Some characters like [ ] @ are encoded by encodeURIComponent() but are often requested at an unencoded URL path.
  This change will make assets with filenames with these characters accessible at both the encoded and unencoded paths,
  but to use the encoded path as the canonical one, and to redirect requests to the canonical path if necessary.

- [#6798](https://github.com/cloudflare/workers-sdk/pull/6798) [`7d7f19a`](https://github.com/cloudflare/workers-sdk/commit/7d7f19a2ca501d311c00d15c78ba3bec1a50353e) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: error if an asset binding is provided without a Worker script

- Updated dependencies [[`1ca313f`](https://github.com/cloudflare/workers-sdk/commit/1ca313f2041688cd13e25f0817e3b72dfc930bac)]:
  - @cloudflare/workers-shared@0.5.4
  - miniflare@3.20240909.5

## 3.78.7

### Patch Changes

- [#6775](https://github.com/cloudflare/workers-sdk/pull/6775) [`ecd82e8`](https://github.com/cloudflare/workers-sdk/commit/ecd82e8471688901307c3bbbab8a382eb9d04811) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Support switching between static and dynamic Workers

  This commit fixes the current behaviour of watch mode for Workers with assets, and adds support for switching between static and dynamic Workers within a single `wrangler dev` session.

- [#6762](https://github.com/cloudflare/workers-sdk/pull/6762) [`2840b9f`](https://github.com/cloudflare/workers-sdk/commit/2840b9f80c1b8fe66489eb6d749c38f6ece2779d) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: error if a user inadvertently uploads a Pages `_workers.js` file or directory as an asset

- [#6778](https://github.com/cloudflare/workers-sdk/pull/6778) [`61dd93a`](https://github.com/cloudflare/workers-sdk/commit/61dd93aaacac8b421b4ffcf7cde59ed6b651fc1b) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Error if Workers + Assets are run in remote mode

  Workers + Assets are currently supported only in local mode. We should throw an error if users attempt to use Workers with assets in remote mode.

- [#6782](https://github.com/cloudflare/workers-sdk/pull/6782) [`7655505`](https://github.com/cloudflare/workers-sdk/commit/7655505654400c8525e4b0164e4e5b3b3c20bed4) Thanks [@vicb](https://github.com/vicb)! - chore: update unenv dependency version

- [#6777](https://github.com/cloudflare/workers-sdk/pull/6777) [`9649dbc`](https://github.com/cloudflare/workers-sdk/commit/9649dbc74d022fa5fdb065cf3e7a8d6d791f0a88) Thanks [@penalosa](https://github.com/penalosa)! - chore: Update CI messaging

- [#6779](https://github.com/cloudflare/workers-sdk/pull/6779) [`3e75612`](https://github.com/cloudflare/workers-sdk/commit/3e75612ffb5e422021d1d3b172e5dc93a4b7c48a) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: include asset binding in `wrangler types`

## 3.78.6

### Patch Changes

- [#6743](https://github.com/cloudflare/workers-sdk/pull/6743) [`b45e326`](https://github.com/cloudflare/workers-sdk/commit/b45e32695cc1b4d5c5fb84384cff30a15f744bb3) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ability to build tricky Node.js compat scenario Workers

  Adds support for non-default build conditions and platform via the WRANGLER_BUILD_CONDITIONS and WRANGLER_BUILD_PLATFORM flags.

  Fixes https://github.com/cloudflare/workers-sdk/issues/6742

- [#6776](https://github.com/cloudflare/workers-sdk/pull/6776) [`02de103`](https://github.com/cloudflare/workers-sdk/commit/02de103435689c552e231a2ae2249adeb5f60a8b) Thanks [@zebp](https://github.com/zebp)! - fix: disable observability on deploy if not explicitly defined in config

  When deploying a Worker that has observability enabled in the deployed version but not specified in the `wrangler.toml` Wrangler will now set observability to disabled for the new version to match the `wrangler.toml` as the source of truth.

- Updated dependencies [[`2ddbb65`](https://github.com/cloudflare/workers-sdk/commit/2ddbb65033e88dfc2127a093fc894ac91bd96369)]:
  - miniflare@3.20240909.4

## 3.78.5

### Patch Changes

- [#6744](https://github.com/cloudflare/workers-sdk/pull/6744) [`e3136f9`](https://github.com/cloudflare/workers-sdk/commit/e3136f9354517b448d557341a429f0820dea33a0) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - chore: update unenv dependency version

- [#6749](https://github.com/cloudflare/workers-sdk/pull/6749) [`9a06f88`](https://github.com/cloudflare/workers-sdk/commit/9a06f88dac311a2ff64df6bdc7ae90418bd0ec6c) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Throw error when attempting to configure Workers with assets and tail consumers

  Tail Workers are currently not supported for Workers with assets. This commit ensures we throw a corresponding error if users are attempting to configure `tail_consumers` via their configuration file, for a Worker with assets. This validation is applied for all `wrangler dev`, `wrangler deploy`, `wrangler versions upload`.

- [#6746](https://github.com/cloudflare/workers-sdk/pull/6746) [`0deb42b`](https://github.com/cloudflare/workers-sdk/commit/0deb42b2b6b5960d0bd79884471805069c0f29b0) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Fix assets upload message to correctly report number of uploaded assets

- [#6745](https://github.com/cloudflare/workers-sdk/pull/6745) [`6dbbb88`](https://github.com/cloudflare/workers-sdk/commit/6dbbb880966caa58f29f5aafff764af57988db63) Thanks [@jonesphillip](https://github.com/jonesphillip)! - fix: r2 bucket notification get <bucket_name> has been marked deprecated in favor of r2 bucket notification list <bucket_name> to reflect behavior.

- Updated dependencies [[`2407c41`](https://github.com/cloudflare/workers-sdk/commit/2407c41484f29845a64ccffd9368bc5d234eb831)]:
  - miniflare@3.20240909.3

## 3.78.4

### Patch Changes

- [#6706](https://github.com/cloudflare/workers-sdk/pull/6706) [`1c42466`](https://github.com/cloudflare/workers-sdk/commit/1c4246631e4fe248e584e7db6a73810b9a87ea9f) Thanks [@jkoe-cf](https://github.com/jkoe-cf)! - fix: making explicit to only send a body if there are rule ids specified in the config delete

- [#6714](https://github.com/cloudflare/workers-sdk/pull/6714) [`62082aa`](https://github.com/cloudflare/workers-sdk/commit/62082aa75b767368d0a5c8c59a24a5f91a1b0c73) Thanks [@OilyLime](https://github.com/OilyLime)! - fix: rough edges when creating and updating Hyperdrive over Access configs

- [#6705](https://github.com/cloudflare/workers-sdk/pull/6705) [`ea60a52`](https://github.com/cloudflare/workers-sdk/commit/ea60a52a4e350b6c439d734618e3cd4187f3f2d5) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: include compatibility date in static-asset only uploads (experimental feature)

## 3.78.3

### Patch Changes

- [#6686](https://github.com/cloudflare/workers-sdk/pull/6686) [`2c8506f`](https://github.com/cloudflare/workers-sdk/commit/2c8506f874171f4ccdf99357855389841578d348) Thanks [@DaniFoldi](https://github.com/DaniFoldi)! - fix: Bump path-to-regexp dependency version

- [#6329](https://github.com/cloudflare/workers-sdk/pull/6329) [`c135de4`](https://github.com/cloudflare/workers-sdk/commit/c135de4707234e11f7f6438bea6a7067e8f284f9) Thanks [@penalosa](https://github.com/penalosa)! - chore: Cache generated runtime types

- Updated dependencies [[`5b5dd95`](https://github.com/cloudflare/workers-sdk/commit/5b5dd9573b2c43023cbcba0fbcc3e374465e745e)]:
  - miniflare@3.20240909.2

## 3.78.2

### Patch Changes

- Updated dependencies [[`7a8bb17`](https://github.com/cloudflare/workers-sdk/commit/7a8bb17a5f35e11cba336ca1bc5ea16413291bc7)]:
  - @cloudflare/workers-shared@0.5.3
  - miniflare@3.20240909.1

## 3.78.1

### Patch Changes

- Updated dependencies [[`31bfd37`](https://github.com/cloudflare/workers-sdk/commit/31bfd374cf6764c1e8a4491518c58cb112010340), [`5d8547e`](https://github.com/cloudflare/workers-sdk/commit/5d8547e26e9f5e2eb9516b17a096cd1ea9f63469)]:
  - @cloudflare/workers-shared@0.5.2
  - miniflare@3.20240909.1

## 3.78.0

### Minor Changes

- [#6643](https://github.com/cloudflare/workers-sdk/pull/6643) [`f30c61f`](https://github.com/cloudflare/workers-sdk/commit/f30c61f1f59ee010c53d3696ad19fe309d315cb9) Thanks [@WalshyDev](https://github.com/WalshyDev)! - feat: add "Deployment alias URL" to `wrangler pages deploy` if an alias is available for this deployment.

- [#6415](https://github.com/cloudflare/workers-sdk/pull/6415) [`b27b741`](https://github.com/cloudflare/workers-sdk/commit/b27b741809babae34f95641b968dacb0db77a815) Thanks [@irvinebroque](https://github.com/irvinebroque)! - chore: Redirect `wrangler generate [template name]` and `wrangler init` to `npm create cloudflare`

- [#6647](https://github.com/cloudflare/workers-sdk/pull/6647) [`d68e8c9`](https://github.com/cloudflare/workers-sdk/commit/d68e8c996ba40eaaf4a3b237f89880bdaafd0113) Thanks [@joshthoward](https://github.com/joshthoward)! - feat: Configure SQLite backed Durable Objects in local dev

- [#6696](https://github.com/cloudflare/workers-sdk/pull/6696) [`0a9e90a`](https://github.com/cloudflare/workers-sdk/commit/0a9e90a309106c21c9e8ac2982d500c16aacb1e2) Thanks [@penalosa](https://github.com/penalosa)! - feat: Support `WRANGLER_CI_MATCH_TAG` environment variable.

  When set, this will ensure that `wrangler deploy` and `wrangler versions upload` only deploy to Workers which match the provided tag.

- [#6702](https://github.com/cloudflare/workers-sdk/pull/6702) [`aa603ab`](https://github.com/cloudflare/workers-sdk/commit/aa603ab82fbc35212de19fd1957055493118a73b) Thanks [@hhoughgg](https://github.com/hhoughgg)! - feat: Hide `wrangler pipelines` until release

### Patch Changes

- [#6699](https://github.com/cloudflare/workers-sdk/pull/6699) [`2507304`](https://github.com/cloudflare/workers-sdk/commit/2507304d9680e9968173560fe57f3e909f293fd7) Thanks [@joshthoward](https://github.com/joshthoward)! - fix: Bugs when warning users using SQLite in Durable Objects in remote dev

- [#6693](https://github.com/cloudflare/workers-sdk/pull/6693) [`0737e0f`](https://github.com/cloudflare/workers-sdk/commit/0737e0f78baa98d2cec27e96edefc86500445429) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Persist Workers Assets when doing `wrangler versions secrets put/bulk`

- Updated dependencies [[`d68e8c9`](https://github.com/cloudflare/workers-sdk/commit/d68e8c996ba40eaaf4a3b237f89880bdaafd0113), [`fed1fda`](https://github.com/cloudflare/workers-sdk/commit/fed1fda90d1434b5ce214656249b0ad723ce48c1)]:
  - miniflare@3.20240909.1
  - @cloudflare/workers-shared@0.5.1

## 3.77.0

### Minor Changes

- [#6674](https://github.com/cloudflare/workers-sdk/pull/6674) [`831f892`](https://github.com/cloudflare/workers-sdk/commit/831f89217627554f4fc984dd8d51bf2a4409ec31) Thanks [@andyjessop](https://github.com/andyjessop)! - feat: Added new [[pipelines]] bindings. This creates a new binding that allows sending events to
  the specified pipeline.

  Example:

  [[pipelines]]
  binding = "MY_PIPELINE"
  pipeline = "my-pipeline"

- [#6668](https://github.com/cloudflare/workers-sdk/pull/6668) [`88c40be`](https://github.com/cloudflare/workers-sdk/commit/88c40bec9b32ae1a6bcc2f41427ba5958cb3ae63) Thanks [@zebp](https://github.com/zebp)! - feature: add observability setting to wrangler.toml

  Adds the `observability` setting which provides your Worker with automatic persistent logs that can be searched, filtered, and queried directly from the Workers dashboard.

- [#6679](https://github.com/cloudflare/workers-sdk/pull/6679) [`2174127`](https://github.com/cloudflare/workers-sdk/commit/21741277a5bcd6fe6a3f531c8cacc34df84d287e) Thanks [@jkoe-cf](https://github.com/jkoe-cf)! - feat: adding option to specify a rule within the config to delete (if no rules are specified, all rules get deleted)

- [#6666](https://github.com/cloudflare/workers-sdk/pull/6666) [`4107f57`](https://github.com/cloudflare/workers-sdk/commit/4107f573b85eb86cc163c4acadf2b85138f76d97) Thanks [@threepointone](https://github.com/threepointone)! - feat: support analytics engine in local/remote dev

  This adds "support" for analytics engine datasets for `wrangler dev`. Specifically, it simply mocks the AE bindings so that they exist while developing (and don't throw when accessed).

  This does NOT add support in Pages, though we very well could do so in a similar way in a followup.

- [#6640](https://github.com/cloudflare/workers-sdk/pull/6640) [`8527675`](https://github.com/cloudflare/workers-sdk/commit/8527675e1cf83519a211c8b4cc43161ac29757f1) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: experimental workers assets can be ignored by adding a .assetsignore file

  This file can be added to the root of the assets directory that is to be uploaded alongside the Worker
  when using `experimental_assets`.

  The file follows the `.gitignore` syntax, and any matching paths will not be included in the upload.

- [#6652](https://github.com/cloudflare/workers-sdk/pull/6652) [`648cfdd`](https://github.com/cloudflare/workers-sdk/commit/648cfdd32d8c1b60e037c3d453fcb1691fbf4b45) Thanks [@bthwaites](https://github.com/bthwaites)! - feat: Update R2 Get Event Notification response, display, and actions

- [#6625](https://github.com/cloudflare/workers-sdk/pull/6625) [`8dcd456`](https://github.com/cloudflare/workers-sdk/commit/8dcd45665c0c420653f57cc7218269e05b2f9a25) Thanks [@maxwellpeterson](https://github.com/maxwellpeterson)! - feature: Add support for placement hints

  Adds the `hint` field to smart placement configuration. When set, placement hints will be used to decide where smart-placement-enabled Workers are run.

- [#6631](https://github.com/cloudflare/workers-sdk/pull/6631) [`59a0072`](https://github.com/cloudflare/workers-sdk/commit/59a0072740aa19f8d2b7524b993a7be35ba67fce) Thanks [@emily-shen](https://github.com/emily-shen)! - feat: Add config options 'html_handling' and 'not_found_handling' to experimental_asset field in wrangler.toml

### Patch Changes

- [#6621](https://github.com/cloudflare/workers-sdk/pull/6621) [`6523db2`](https://github.com/cloudflare/workers-sdk/commit/6523db2695d70ad64da7cfe6f4731ac82181ac51) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: Validate `routes` in `wrangler dev` and `wrangler deploy` for Workers with assets

  We want wrangler to error if users are trying to deploy a Worker with assets, and routes with a path component.

  All Workers with assets must have either:

  - custom domain routes
  - pattern routes which have no path component (except for the wildcard splat) "some.domain.com/\*"

- [#6687](https://github.com/cloudflare/workers-sdk/pull/6687) [`7bbed63`](https://github.com/cloudflare/workers-sdk/commit/7bbed63fb592df9b5fd081eebad614a8a1a4c281) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Fix asset upload count messaging

- [#6628](https://github.com/cloudflare/workers-sdk/pull/6628) [`33cc0ec`](https://github.com/cloudflare/workers-sdk/commit/33cc0ecce9062641649fc6ee2e1d68a15f20fc5c) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Improves messaging when uploading assets

- [#6671](https://github.com/cloudflare/workers-sdk/pull/6671) [`48eeff4`](https://github.com/cloudflare/workers-sdk/commit/48eeff4674a47da4d1faffc93f44543e909fca01) Thanks [@jkoe-cf](https://github.com/jkoe-cf)! - fix: Update R2 Create Event Notification response

- [#6618](https://github.com/cloudflare/workers-sdk/pull/6618) [`67711c2`](https://github.com/cloudflare/workers-sdk/commit/67711c2158d706ba2e6bafebf923013e0e0feec0) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Switch to multipart/form-data upload format for Workers Assets

  This has proven to be much more reliable.

- Updated dependencies [[`3f5b934`](https://github.com/cloudflare/workers-sdk/commit/3f5b9343a46dedcb80c8e216eb3ca9d7f687f6cf), [`59a0072`](https://github.com/cloudflare/workers-sdk/commit/59a0072740aa19f8d2b7524b993a7be35ba67fce)]:
  - miniflare@3.20240909.0
  - @cloudflare/workers-shared@0.5.0

## 3.76.0

### Minor Changes

- [#6126](https://github.com/cloudflare/workers-sdk/pull/6126) [`18c105b`](https://github.com/cloudflare/workers-sdk/commit/18c105baec9d3625b56531ec332517fcae1ede59) Thanks [@IRCody](https://github.com/IRCody)! - feature: Add 'cloudchamber curl' command

  Adds a cloudchamber curl command which allows easy access to arbitrary cloudchamber API endpoints.

- [#6649](https://github.com/cloudflare/workers-sdk/pull/6649) [`46a91e7`](https://github.com/cloudflare/workers-sdk/commit/46a91e7e7d286e6835bb87cfdd6c9096deaeba6e) Thanks [@andyjessop](https://github.com/andyjessop)! - feature: Integrate the Cloudflare Pipelines product into wrangler.

  Cloudflare Pipelines is a product that handles the ingest of event streams
  into R2. This feature integrates various forms of managing pipelines.

  Usage:
  `wrangler pipelines create <pipeline>`: Create a new pipeline
  `wrangler pipelines list`: List current pipelines
  `wrangler pipelines show <pipeline>`: Show a pipeline configuration
  `wrangler pipelines update <pipeline>`: Update a pipeline
  `wrangler pipelines delete <pipeline>`: Delete a pipeline

  Examples:
  wrangler pipelines create my-pipeline --r2 MY_BUCKET --access-key-id "my-key" --secret-access-key "my-secret"
  wrangler pipelines show my-pipeline
  wrangler pipelines delete my-pipline

### Patch Changes

- [#6612](https://github.com/cloudflare/workers-sdk/pull/6612) [`6471090`](https://github.com/cloudflare/workers-sdk/commit/64710904ad4055054bea09ebb23ededab140aa79) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: Add hyperdrive binding support in `getPlatformProxy`

  example:

  ```toml
  # wrangler.toml
  [[hyperdrive]]
  binding = "MY_HYPERDRIVE"
  id = "000000000000000000000000000000000"
  localConnectionString = "postgres://user:pass@127.0.0.1:1234/db"
  ```

  ```js
  // index.mjs

  import postgres from "postgres";
  import { getPlatformProxy } from "wrangler";

  const { env, dispose } = await getPlatformProxy();

  try {
  	const sql = postgres(
  		// Note: connectionString points to `postgres://user:pass@127.0.0.1:1234/db` not to the actual hyperdrive
  		//       connection string, for more details see the explanation below
  		env.MY_HYPERDRIVE.connectionString
  	);
  	const results = await sql`SELECT * FROM pg_tables`;
  	await sql.end();
  } catch (e) {
  	console.error(e);
  }

  await dispose();
  ```

  Note: the returned binding values are no-op/passthrough that can be used inside node.js, meaning
  that besides direct connections via the `connect` methods, all the other values point to the
  same db connection specified in the user configuration

- [#6620](https://github.com/cloudflare/workers-sdk/pull/6620) [`ecdfabe`](https://github.com/cloudflare/workers-sdk/commit/ecdfabed04cdc56bfb4fd43cd769eda48ba13366) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: don't warn about `node:async_hooks` if `nodejs_als` is set

  Fixes #6011

- Updated dependencies [[`5936282`](https://github.com/cloudflare/workers-sdk/commit/5936282bfbda848b465396a70f6334988d1a57a0), [`6471090`](https://github.com/cloudflare/workers-sdk/commit/64710904ad4055054bea09ebb23ededab140aa79)]:
  - miniflare@3.20240821.2

## 3.75.0

### Minor Changes

- [#6603](https://github.com/cloudflare/workers-sdk/pull/6603) [`a197460`](https://github.com/cloudflare/workers-sdk/commit/a197460f47db47279f2c5536269cd0de2b543576) Thanks [@taylorlee](https://github.com/taylorlee)! - feature: log version preview url when previews exist

  The version upload API returns a field indicating whether
  a preview exists for that version. If a preview exists and
  workers.dev is enabled, wrangler will now log the full
  URL on version upload.

  This does not impact wrangler deploy, which only prints the
  workers.dev route of the latest deployment.

- [#6550](https://github.com/cloudflare/workers-sdk/pull/6550) [`8d1d464`](https://github.com/cloudflare/workers-sdk/commit/8d1d464f2b549dc7d7020fd45f025cd7c8671ce9) Thanks [@Pedr0Rocha](https://github.com/Pedr0Rocha)! - feature: add RateLimit type generation to the ratelimit unsafe binding.

### Patch Changes

- [#6615](https://github.com/cloudflare/workers-sdk/pull/6615) [`21a09e0`](https://github.com/cloudflare/workers-sdk/commit/21a09e06473e28722c3fe73dee9cd49b41807be3) Thanks [@RamIdeas](https://github.com/RamIdeas)! - chore: avoid potential double-install of create-cloudflare

  When `wrangler init` delegates to C3, it did so via `npm create cloudflare@2.5.0`. C3's v2.5.0 was the first to include auto-update support to avoid `npx`'s potentially stale cache. But this also guaranteed a double install for users who do not have 2.5.0 cached. Now, wrangler delegates via `npm create cloudflare@^2.5.0` which should use the latest version cached on the user's system or install and use the latest v2.x.x.

- [#6603](https://github.com/cloudflare/workers-sdk/pull/6603) [`a197460`](https://github.com/cloudflare/workers-sdk/commit/a197460f47db47279f2c5536269cd0de2b543576) Thanks [@taylorlee](https://github.com/taylorlee)! - chore: fix version upload log order

  Previously deploy prints:
  upload timings
  deploy timings
  current version id

  while version upload prints:
  worker version id
  upload timings

  This change makes version upload more similar to deploy by printing
  version id after upload, which also makes more sense, as version ID can
  only be known after upload has finished.

## 3.74.0

### Minor Changes

- [#6574](https://github.com/cloudflare/workers-sdk/pull/6574) [`dff8d44`](https://github.com/cloudflare/workers-sdk/commit/dff8d44f4e47b746b9b1fa276094e1dc4c4f906b) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: add support for experimental assets in `wrangler dev` watch mode

### Patch Changes

- [#6605](https://github.com/cloudflare/workers-sdk/pull/6605) [`c4f0d9e`](https://github.com/cloudflare/workers-sdk/commit/c4f0d9e01ef333f5882096ad1e0f37e0911089a7) Thanks [@WalshyDev](https://github.com/WalshyDev)! - fix: ensure we update non-versioned Worker settings for the new deploy path in `wrangler deploy`

- Updated dependencies [[`e8975a9`](https://github.com/cloudflare/workers-sdk/commit/e8975a93a46d41ea270f63fd9ef40677ccc689c3)]:
  - miniflare@3.20240821.1

## 3.73.0

### Minor Changes

- [#6571](https://github.com/cloudflare/workers-sdk/pull/6571) [`a7e1bfe`](https://github.com/cloudflare/workers-sdk/commit/a7e1bfea3e01413495e964c09ce74f209f408d32) Thanks [@penalosa](https://github.com/penalosa)! - feat: Add deployment http targets to wrangler deploy logs, and add url to pages deploy logs

- [#6497](https://github.com/cloudflare/workers-sdk/pull/6497) [`3bd833c`](https://github.com/cloudflare/workers-sdk/commit/3bd833cbe29b92edf512759833f0a0115e1799bc) Thanks [@WalshyDev](https://github.com/WalshyDev)! - chore: move `wrangler versions ...`, `wrangler deployments ...`, `wrangler rollback` and `wrangler triggers ...` out of experimental and open beta.
  These are now available to use without the --x-versions flag, you can continue to pass this however without issue to keep compatibility with all the usage today.

  A few of the commands had an output that wasn't guarded by `--x-versions` those have been updated to use the newer output, we have tried to keep compatibility where possible (for example: `wrangler rollback` will continue to output "Worker Version ID:" so users can continue to grab the ID).
  If you wish to use the old versions of the commands you can pass the `--no-x-versions` flag. Note, these will be removed in the future so please work on migrating.

- [#6586](https://github.com/cloudflare/workers-sdk/pull/6586) [`72ea742`](https://github.com/cloudflare/workers-sdk/commit/72ea74214d8df3bcabf842249865edc9d13029f1) Thanks [@penalosa](https://github.com/penalosa)! - feat: Inject a 404 response for browser requested `favicon.ico` files when loading the `/__scheduled` page for scheduled-only Workers

- [#6497](https://github.com/cloudflare/workers-sdk/pull/6497) [`3bd833c`](https://github.com/cloudflare/workers-sdk/commit/3bd833cbe29b92edf512759833f0a0115e1799bc) Thanks [@WalshyDev](https://github.com/WalshyDev)! - feat: update `wrangler deploy` to use the new versions and deployments API.
  This should have zero user-facing impact but sets up the most used command to deploy Workers to use the new recommended APIs and move away from the old ones.
  We will still call the old upload path where required (e.g. Durable Object migration or Service Worker format).

### Patch Changes

- [#6563](https://github.com/cloudflare/workers-sdk/pull/6563) [`da48a70`](https://github.com/cloudflare/workers-sdk/commit/da48a7036911bbc5b23d7cd70e3260b3c3fa99bc) Thanks [@threepointone](https://github.com/threepointone)! - chore: remove the warning about local mode flag being removed in the future

- [#6595](https://github.com/cloudflare/workers-sdk/pull/6595) [`0a76d7e`](https://github.com/cloudflare/workers-sdk/commit/0a76d7e550893eefb60ffe78236ef5fc3a6d3e2e) Thanks [@vicb](https://github.com/vicb)! - feat: update unenv to the latest available version

- [#5738](https://github.com/cloudflare/workers-sdk/pull/5738) [`c2460c4`](https://github.com/cloudflare/workers-sdk/commit/c2460c4d89ecdf74f48bcd37466dce47d01c4f43) Thanks [@penalosa](https://github.com/penalosa)! - fix: Prevent spaces in names when validating

- [#6586](https://github.com/cloudflare/workers-sdk/pull/6586) [`72ea742`](https://github.com/cloudflare/workers-sdk/commit/72ea74214d8df3bcabf842249865edc9d13029f1) Thanks [@penalosa](https://github.com/penalosa)! - chore: Improve Miniflare CRON warning wording

- [#6593](https://github.com/cloudflare/workers-sdk/pull/6593) [`f097cb7`](https://github.com/cloudflare/workers-sdk/commit/f097cb73befbd317ce0c4ab4cd0203e9e8e9b811) Thanks [@vicb](https://github.com/vicb)! - fix: remove `experimental:` prefix requirement for nodejs_compat_v2

  See https://jira.cfdata.org/browse/DEVDASH-218

- [#6572](https://github.com/cloudflare/workers-sdk/pull/6572) [`0d83428`](https://github.com/cloudflare/workers-sdk/commit/0d834284d00b43bd1da5d09404ff7a6b8409babe) Thanks [@penalosa](https://github.com/penalosa)! - fix: Show a clearer user error when trying to use a python worker without the `python_workers` compatibility flag specified

- [#6589](https://github.com/cloudflare/workers-sdk/pull/6589) [`f4c8cea`](https://github.com/cloudflare/workers-sdk/commit/f4c8cea142b03629e0dfffc5acaf71da0a33d15c) Thanks [@vicb](https://github.com/vicb)! - feat: update unenv to the latest available version

- Updated dependencies [[`45ad2e0`](https://github.com/cloudflare/workers-sdk/commit/45ad2e0c83f1382e1662aadc2b145969ed9a719b)]:
  - @cloudflare/workers-shared@0.4.1

## 3.72.3

### Patch Changes

- [#6548](https://github.com/cloudflare/workers-sdk/pull/6548) [`439e63a`](https://github.com/cloudflare/workers-sdk/commit/439e63a4ac636fc16196e900d863863b7395feed) Thanks [@garvit-gupta](https://github.com/garvit-gupta)! - fix: Fix Vectorize getVectors, deleteVectors payload in Wrangler Client; VS-271

- [#6554](https://github.com/cloudflare/workers-sdk/pull/6554) [`46aee5d`](https://github.com/cloudflare/workers-sdk/commit/46aee5d16c46ae734ba8196d4d942d0fb69d0730) Thanks [@andyjessop](https://github.com/andyjessop)! - fix: nodejs_compat flags no longer error when running wrangler types --x-include-runtime

- [#6548](https://github.com/cloudflare/workers-sdk/pull/6548) [`439e63a`](https://github.com/cloudflare/workers-sdk/commit/439e63a4ac636fc16196e900d863863b7395feed) Thanks [@garvit-gupta](https://github.com/garvit-gupta)! - fix: Add content-type header to Vectorize POST operations; #6516/VS-269

- [#6566](https://github.com/cloudflare/workers-sdk/pull/6566) [`669ec1c`](https://github.com/cloudflare/workers-sdk/commit/669ec1c4d100aec1e16131cf178f2aa1a067b372) Thanks [@penalosa](https://github.com/penalosa)! - fix: Ensure esbuild warnings are logged when running wrangler deploy

- Updated dependencies [[`6c057d1`](https://github.com/cloudflare/workers-sdk/commit/6c057d10b22e9a2e08aa066e074c792cff78d1da)]:
  - @cloudflare/workers-shared@0.4.0

## 3.72.2

### Patch Changes

- [#6511](https://github.com/cloudflare/workers-sdk/pull/6511) [`e75c581`](https://github.com/cloudflare/workers-sdk/commit/e75c5812f54e8660f3880e240cdb0051fc01674f) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: allow Pages projects to use `experimental:nodejs_compat_v2" flag

  Fixes #6288

- Updated dependencies [[`b0e2f0b`](https://github.com/cloudflare/workers-sdk/commit/b0e2f0bfc67bee9c43a64ca12447e778758c27cd), [`f5bde66`](https://github.com/cloudflare/workers-sdk/commit/f5bde66914d24c59da35e051c5343c8f0554f782)]:
  - miniflare@3.20240821.0
  - @cloudflare/workers-shared@0.3.0

## 3.72.1

### Patch Changes

- [#6530](https://github.com/cloudflare/workers-sdk/pull/6530) [`d0ecc6a`](https://github.com/cloudflare/workers-sdk/commit/d0ecc6afb24160862083c09eb316103162d94720) Thanks [@WalshyDev](https://github.com/WalshyDev)! - fix: fixed `wrangler versions upload` printing bindings twice

- [#6502](https://github.com/cloudflare/workers-sdk/pull/6502) [`a9b4f25`](https://github.com/cloudflare/workers-sdk/commit/a9b4f252ccbce4856ffc967e51c0aa8cf2e1bb4f) Thanks [@garvit-gupta](https://github.com/garvit-gupta)! - fix: Fix Vectorize List MetadataIndex Http Method

- [#6508](https://github.com/cloudflare/workers-sdk/pull/6508) [`56a3de2`](https://github.com/cloudflare/workers-sdk/commit/56a3de2c8b50f029e5c8c0554b563b9e715f629c) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: move the Windows C++ redistributable warning so it is only shown if there is an actual access violation

  Replaces #6471, which was too verbose.

  Fixes #6170

## 3.72.0

### Minor Changes

- [#6479](https://github.com/cloudflare/workers-sdk/pull/6479) [`3c24d84`](https://github.com/cloudflare/workers-sdk/commit/3c24d84ffaed0e8c5a0f1f20354b837eb0815cf6) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: allow HTTPS custom certificate paths to be provided by a environment variables

  As well as providing paths to custom HTTPS certificate files, it is now possible to use WRANGLER_HTTPS_KEY_PATH and WRANGLER_HTTPS_CERT_PATH environment variables.

  Specifying the file paths at the command line overrides specifying in environment variables.

  Fixes #5997

### Patch Changes

- [#6471](https://github.com/cloudflare/workers-sdk/pull/6471) [`0d85f24`](https://github.com/cloudflare/workers-sdk/commit/0d85f24644d2a4600255b692e79060533f5b41e4) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add a helpful message on Windows when Miniflare fails to start

- [#6489](https://github.com/cloudflare/workers-sdk/pull/6489) [`34bf393`](https://github.com/cloudflare/workers-sdk/commit/34bf3930101401ca01772f71d7e53f623293def9) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Upload assets as JSON Lines (application/jsonl) rather than NDJSON (application/x-ndjson)

- [#6482](https://github.com/cloudflare/workers-sdk/pull/6482) [`e24939c`](https://github.com/cloudflare/workers-sdk/commit/e24939c53475228e12a3c5228aa652c6473a889f) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: reimplement module aliasing so user-defined aliases take precedence over other plugins (eg unenv node.js polyfills)

- Updated dependencies [[`00f340f`](https://github.com/cloudflare/workers-sdk/commit/00f340f7c1709db777e80a8ea24d245909ff4486)]:
  - miniflare@3.20240806.1
  - @cloudflare/workers-shared@0.2.0

## 3.71.0

### Minor Changes

- [#6464](https://github.com/cloudflare/workers-sdk/pull/6464) [`da9106c`](https://github.com/cloudflare/workers-sdk/commit/da9106c7c1d2734c04b6aa357ba0d4f054871466) Thanks [@AnantharamanSI](https://github.com/AnantharamanSI)! - feat: rename `--count` to `--limit` in `wrangler d1 insights`

  This PR renames `wrangler d1 insight`'s `--count` flag to `--limit` to improve clarity and conform to naming conventions.

  To avoid a breaking change, we have kept `--count` as an alias to `--limit`.

- [#6451](https://github.com/cloudflare/workers-sdk/pull/6451) [`515de6a`](https://github.com/cloudflare/workers-sdk/commit/515de6ab40ed6154a2e6579ff90b14b304809609) Thanks [@danielrs](https://github.com/danielrs)! - feat: `whoami` shows membership information when available

- [#6463](https://github.com/cloudflare/workers-sdk/pull/6463) [`dbc6782`](https://github.com/cloudflare/workers-sdk/commit/dbc678218a0ec9c42201da1300c610068c3d7dcb) Thanks [@AnantharamanSI](https://github.com/AnantharamanSI)! - feat: add queryEfficiency to `wrangler d1 insights` output

- [#6252](https://github.com/cloudflare/workers-sdk/pull/6252) [`a2a144c`](https://github.com/cloudflare/workers-sdk/commit/a2a144ca1bcdf83118bf1d61427ffd0ae265c1a2) Thanks [@garvit-gupta](https://github.com/garvit-gupta)! - feat: Enable Wrangler to operate on Vectorize V2 indexes

### Patch Changes

- [#6424](https://github.com/cloudflare/workers-sdk/pull/6424) [`3402ab9`](https://github.com/cloudflare/workers-sdk/commit/3402ab9d517553fe0a602669e8e151a82555a72c) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: using a debugger sometimes disconnected with "Message is too large" error

## 3.70.0

### Minor Changes

- [#6383](https://github.com/cloudflare/workers-sdk/pull/6383) [`05082ad`](https://github.com/cloudflare/workers-sdk/commit/05082adae40c9b30a72b6b6b31f466803f5eab5d) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: support outputting ND-JSON files via an environment variable

### Patch Changes

- [#6440](https://github.com/cloudflare/workers-sdk/pull/6440) [`09b5092`](https://github.com/cloudflare/workers-sdk/commit/09b50927a62731f8aa621b9d872d10d1900a60a5) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: tweak the properties of the new Wrangler output file entries for better consistency

- Updated dependencies [[`d55eeca`](https://github.com/cloudflare/workers-sdk/commit/d55eeca878b68bd10ddcc5ef3b1b4d820b037684)]:
  - miniflare@3.20240806.0

## 3.69.1

### Patch Changes

- [#6432](https://github.com/cloudflare/workers-sdk/pull/6432) [`cba2e25`](https://github.com/cloudflare/workers-sdk/commit/cba2e25ec3f4a8402c6960ac84651b7dfe2f11ff) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: prevent crash when running wrangler dev due to missing dependency

## 3.69.0

### Minor Changes

- [#6392](https://github.com/cloudflare/workers-sdk/pull/6392) [`c3e19b7`](https://github.com/cloudflare/workers-sdk/commit/c3e19b790bb597b78e0109a162ca8049b5eaf973) Thanks [@taylorlee](https://github.com/taylorlee)! - feat: log Worker startup time in the `version upload` command

- [#6370](https://github.com/cloudflare/workers-sdk/pull/6370) [`8a3c6c0`](https://github.com/cloudflare/workers-sdk/commit/8a3c6c00105a3420e46da660bd3f317b26f1c6d4) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Create very basic Asset Server Worker and plumb it into `wrangler dev`

  These changes do the ground work needed in order to add Assets support for Workers in `wrangler dev`. They implement the following:

  - it creates a new package called `workers-shared` that hosts the `Asset Server Worker`, and the `Router Worker`in the future
  - it scaffolds the `Asset Server Worker` in some very basic form, with basic configuration. Further behaviour implementation will follow in a subsequent PR
  - it does the ground work of plumbing ASW into Miniflare

### Patch Changes

- [#6392](https://github.com/cloudflare/workers-sdk/pull/6392) [`c3e19b7`](https://github.com/cloudflare/workers-sdk/commit/c3e19b790bb597b78e0109a162ca8049b5eaf973) Thanks [@taylorlee](https://github.com/taylorlee)! - fix: remove bundle size warning from Worker deploy commands

  Bundle size was a proxy for startup time. Now that we have startup time
  reported, focus on bundle size is less relevant.

## 3.68.0

### Minor Changes

- [#6318](https://github.com/cloudflare/workers-sdk/pull/6318) [`dc576c8`](https://github.com/cloudflare/workers-sdk/commit/dc576c8b99d9de4afe06f568ce2e428478d6a752) Thanks [@danlapid](https://github.com/danlapid)! - feat: Add a log for worker startup time in wrangler deploy

- [#6097](https://github.com/cloudflare/workers-sdk/pull/6097) [`64f34e8`](https://github.com/cloudflare/workers-sdk/commit/64f34e807fb46e33fecd3c7a0aed2d4f543cc2cf) Thanks [@RamIdeas](https://github.com/RamIdeas)! - feat: implements the `--experimental-dev-env` (shorthand: `--x-dev-env`) flag for `wrangler pages dev`

### Patch Changes

- [#6379](https://github.com/cloudflare/workers-sdk/pull/6379) [`31aa15c`](https://github.com/cloudflare/workers-sdk/commit/31aa15ccc931d757a449ade2bd1881bf9a83ca51) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: clearer error message when trying to use Workers Sites or Legacy Assets with `wrangler versions upload`

- [#6367](https://github.com/cloudflare/workers-sdk/pull/6367) [`7588800`](https://github.com/cloudflare/workers-sdk/commit/7588800415452fba06f49dd0fdea04fdb6df1498) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: implicitly cleanup (call `stop()`) in `unstable_dev` if the returned Promise rejected and the `stop()` function was not returned

- [#6330](https://github.com/cloudflare/workers-sdk/pull/6330) [`cfbdede`](https://github.com/cloudflare/workers-sdk/commit/cfbdede63cfe11e6aa9e8c897eec8c00e1de85d6) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: when the worker's request.url is overridden using the `host` or `localUpstream`, ensure `port` is overridden/cleared too

  When using `--localUpstream=example.com`, the request.url would incorrectly be "example.com:8787" but is now "example.com".

  This only applies to `wrangler dev --x-dev-env` and `unstable_dev({ experimental: { devEnv: true } })`.

- [#6365](https://github.com/cloudflare/workers-sdk/pull/6365) [`13549c3`](https://github.com/cloudflare/workers-sdk/commit/13549c39588920ffe99bd9866cbd1a5a6fb9eb81) Thanks [@WalshyDev](https://github.com/WalshyDev)! - fix: WASM modules meant that `wrangler versions secret ...` could not properly update the version. This has now been fixed.

- Updated dependencies [[`a9021aa`](https://github.com/cloudflare/workers-sdk/commit/a9021aa520541e6a83e572d01e57e232cbc163e0), [`44ad2c7`](https://github.com/cloudflare/workers-sdk/commit/44ad2c777bd254dbb62cf7f8b1c2f8351c74fb75)]:
  - miniflare@3.20240725.0

## 3.67.1

### Patch Changes

- [#6312](https://github.com/cloudflare/workers-sdk/pull/6312) [`67c611a`](https://github.com/cloudflare/workers-sdk/commit/67c611a5499b17246ca50568739f9e026df7e5a8) Thanks [@emily-shen](https://github.com/emily-shen)! - feat: add CLI flag and config key for experimental Workers + Assets

  This change adds a new experimental CLI flag (`--experimental-assets`) and configuration key (`experimental_assets`) for the new Workers + Assets work.

  The new flag and configuration key are for the time being "inactive", in the sense that no behaviour is attached to them yet. This will follow up in future work.

- Updated dependencies [[`b3c3cb8`](https://github.com/cloudflare/workers-sdk/commit/b3c3cb89787b8f669485c1c54f9d73ea9ec53605)]:
  - miniflare@3.20240718.1

## 3.67.0

### Minor Changes

- [#4545](https://github.com/cloudflare/workers-sdk/pull/4545) [`e5afae0`](https://github.com/cloudflare/workers-sdk/commit/e5afae0f981304e0abdb281619e60d6f611aed06) Thanks [@G4brym](https://github.com/G4brym)! - Remove experimental/beta constellation commands and binding, please migrate to Workers AI, learn more here https://developers.cloudflare.com/workers-ai/.
  This is not deemed a major version bump for Wrangler since these commands were never generally available.

- [#6322](https://github.com/cloudflare/workers-sdk/pull/6322) [`373248e`](https://github.com/cloudflare/workers-sdk/commit/373248e2f922c40a42b3626c599caeb51d9f5073) Thanks [@IRCody](https://github.com/IRCody)! - Add cloudchamber scope to existing scopes instead of replacing them.

  When using any cloudchamber command the cloudchamber scope will now be added to the existing scopes instead of replacing them.

- [#6276](https://github.com/cloudflare/workers-sdk/pull/6276) [`a432a13`](https://github.com/cloudflare/workers-sdk/commit/a432a133ae825fe3c4d624d08d9fc5426fd64a82) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Add support for `wrangler.jsonc`

  This commit adds support for `wrangler.jsonc` config file for Workers. This feature is available behind the `--experimental-json-config` flag (just like `wrangler.json`).

  To use the new configuration file, add a `wrangler.jsonc` file to your Worker project and run `wrangler dev --experimental-json-config` or `wrangler deploy --experimental-json-config`.

  Please note that this work does NOT add `wrangler.json` or `wrangler.jsonc` support for Pages projects!

- [#6168](https://github.com/cloudflare/workers-sdk/pull/6168) [`1ee41ff`](https://github.com/cloudflare/workers-sdk/commit/1ee41fff2f7fbede1486b45e36a70ad1d98bab59) Thanks [@IRCody](https://github.com/IRCody)! - feature: Add list and remove subcommands to cloudchamber registries command.

### Patch Changes

- [#6331](https://github.com/cloudflare/workers-sdk/pull/6331) [`e6ada07`](https://github.com/cloudflare/workers-sdk/commit/e6ada079f7dfb67975154b39da3cd92f42018c72) Thanks [@threepointone](https://github.com/threepointone)! - fix: only warn about miniflare feature support (ai, vectorize, cron) once

  We have some warnings in local mode dev when trying to use ai bindings / vectorize / cron, but they are printed every time the worker is started. This PR changes the warning to only be printed once per worker start.

## 3.66.0

### Minor Changes

- [#6295](https://github.com/cloudflare/workers-sdk/pull/6295) [`ebc85c3`](https://github.com/cloudflare/workers-sdk/commit/ebc85c362a424778b7f0565217488504bd42964e) Thanks [@andyjessop](https://github.com/andyjessop)! - feat: introduce an experimental flag for `wrangler types` to dynamically generate runtime types according to the user's project configuration.

- [#6272](https://github.com/cloudflare/workers-sdk/pull/6272) [`084d39e`](https://github.com/cloudflare/workers-sdk/commit/084d39e15e35471fabfb789dd280afe16a919fcf) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: add `legacy-assets` config and flag as alias of current `assets` behavior

  - The existing behavior of the `assets` config key/flag will change on August 15th.
  - `legacy-assets` will preserve current functionality.

### Patch Changes

- [#6203](https://github.com/cloudflare/workers-sdk/pull/6203) [`5462ead`](https://github.com/cloudflare/workers-sdk/commit/5462ead9207459e7547ba571157159c8618d3583) Thanks [@geelen](https://github.com/geelen)! - fix: Updating to match new D1 import/export API format

- [#6315](https://github.com/cloudflare/workers-sdk/pull/6315) [`3fd94e7`](https://github.com/cloudflare/workers-sdk/commit/3fd94e7c6ed29339797d9376a8b8398724085b66) Thanks [@penalosa](https://github.com/penalosa)! - chore: Add RayID to `wrangler login` error message displayed when a user hits a bot challenge page

## 3.65.1

### Patch Changes

- [#6267](https://github.com/cloudflare/workers-sdk/pull/6267) [`957d668`](https://github.com/cloudflare/workers-sdk/commit/957d668947b8b234dd909806065c02db6d1b3a01) Thanks [@WalshyDev](https://github.com/WalshyDev)! - chore: add total module size to the logged table, this makes it much easier to see the total size of all modules combined.

- [#6244](https://github.com/cloudflare/workers-sdk/pull/6244) [`e7c06d7`](https://github.com/cloudflare/workers-sdk/commit/e7c06d78b14eb89060f431bc4aee8dbc1cc08fa5) Thanks [@gabivlj](https://github.com/gabivlj)! - fix: wrangler cloudchamber json errors are properly formatted

- Updated dependencies [[`779c713`](https://github.com/cloudflare/workers-sdk/commit/779c71349ea1c747ff4486e4084024a7e88a05cb)]:
  - miniflare@3.20240718.0

## 3.65.0

### Minor Changes

- [#6194](https://github.com/cloudflare/workers-sdk/pull/6194) [`25afcb2`](https://github.com/cloudflare/workers-sdk/commit/25afcb2f118fb06526209340b3562703cdae326b) Thanks [@zebp](https://github.com/zebp)! - chore: Add duration and sourcemap size to upload metrics event

  Wrangler will now send the duration and the total size of any sourcemaps uploaded with your Worker to Cloudflare if you have metrics enabled.

- [#6259](https://github.com/cloudflare/workers-sdk/pull/6259) [`eb201a3`](https://github.com/cloudflare/workers-sdk/commit/eb201a3258469f16c3a42dc5f749ecf3d3ecf372) Thanks [@ottomated](https://github.com/ottomated)! - chore: Add types to DurableObjectNamespace type generation. For example:

  ```ts
  interface Env {
  	OBJECT: DurableObjectNamespace<import("./src/index").MyDurableObject>;
  }
  ```

- [#6245](https://github.com/cloudflare/workers-sdk/pull/6245) [`e4abed3`](https://github.com/cloudflare/workers-sdk/commit/e4abed3e8f9c46a014a045885da0dea5c4ae8837) Thanks [@OilyLime](https://github.com/OilyLime)! - feature: Add support for Hyperdrive over Access configs

### Patch Changes

- [#6255](https://github.com/cloudflare/workers-sdk/pull/6255) [`d497e1e`](https://github.com/cloudflare/workers-sdk/commit/d497e1e38c58ce740bdccf126bd926456d61ea9f) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: teach wrangler init --from-dash about d1 bindings

  This PR teaches `wrangler init --from-dash` about D1 bindings, so they aren't incorrectly added to the wrangler.toml as unsafe bindings.

- [#6258](https://github.com/cloudflare/workers-sdk/pull/6258) [`4f524f2`](https://github.com/cloudflare/workers-sdk/commit/4f524f2eb04f38114adff3590386e06db072f6b0) Thanks [@dom96](https://github.com/dom96)! - feature: Add warning about deploying Python with requirements.txt

  This expands on the warning shown for all Python Workers to include a message about deploying Python Workers with a requirements.txt not being supported.

- [#6249](https://github.com/cloudflare/workers-sdk/pull/6249) [`8bbd824`](https://github.com/cloudflare/workers-sdk/commit/8bbd824980c5b1a706bb2e7bef4e52206f7097cf) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - chore: Update config-schema.json for the wrangler.toml

- [#5955](https://github.com/cloudflare/workers-sdk/pull/5955) [`db11a0f`](https://github.com/cloudflare/workers-sdk/commit/db11a0fd12d7b048e5f74acab876080f79e393b3) Thanks [@harugon](https://github.com/harugon)! - fix: correctly escape newlines in `constructType` function for multiline strings

  This fix ensures that multiline strings are correctly handled by the `constructType` function. Newlines are now properly escaped to prevent invalid JavaScript code generation when using the `wrangler types` command. This improves robustness and prevents errors related to multiline string handling in environment variables and other configuration settings.

- [#6263](https://github.com/cloudflare/workers-sdk/pull/6263) [`fa1016c`](https://github.com/cloudflare/workers-sdk/commit/fa1016cffcb0edcc7fa5deef283481a9b1fd527f) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: use cli script-name arg when deploying a worker with queue consumers

- Updated dependencies [[`0d32448`](https://github.com/cloudflare/workers-sdk/commit/0d32448fc72521be691dfc87c8ad5f108ddced62)]:
  - miniflare@3.20240712.0

## 3.64.0

### Minor Changes

- [#4925](https://github.com/cloudflare/workers-sdk/pull/4925) [`7d4a4d0`](https://github.com/cloudflare/workers-sdk/commit/7d4a4d047be4f18312976efb3339ebba28cf0d82) Thanks [@dom96](https://github.com/dom96)! - feature: whoami, logout and login commands mention the CLOUDFLARE_API_TOKEN env var now

  It is easy to get confused when trying to logout while the CLOUDFLARE_API_TOKEN env var is set.
  The logout command normally prints out a message which states that the user is not logged in. This
  change rectifes this to explicitly call out that the CLOUDFLARE_API_TOKEN is set and requests that
  the user unsets it to logout.

### Patch Changes

- [#5032](https://github.com/cloudflare/workers-sdk/pull/5032) [`75f7928`](https://github.com/cloudflare/workers-sdk/commit/75f7928b3c19a39468d4f2c49c8fbed9281f55be) Thanks [@dbenCF](https://github.com/dbenCF)! - Adding client side error handling for R2 when the user tries to create a bucket with an invalid name. The purpose of this addition is to provide the user with more context when encountering this error.

- [#4398](https://github.com/cloudflare/workers-sdk/pull/4398) [`4b1e5bc`](https://github.com/cloudflare/workers-sdk/commit/4b1e5bcc1dcdbf4c2e4251b066b1f30eec32d8ce) Thanks [@mattpocock](https://github.com/mattpocock)! - fix: update tsconfig for Workers generated by wrangler init

## 3.63.2

### Patch Changes

- [#6199](https://github.com/cloudflare/workers-sdk/pull/6199) [`88313e5`](https://github.com/cloudflare/workers-sdk/commit/88313e50512ffbcfe8717dc60cf83a4d07a7509d) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make sure `getPlatformProxy`'s `ctx` methods throw illegal invocation errors like workerd

  in workerd detaching the `waitUntil` and `passThroughOnException` methods from the `ExecutionContext`
  object results in them throwing `illegal invocation` errors, such as for example:

  ```js
  export default {
  	async fetch(_request, _env, { waitUntil }) {
  		waitUntil(() => {}); // <-- throws an illegal invocation error
  		return new Response("Hello World!");
  	},
  };
  ```

  make sure that the same behavior is applied to the `ctx` object returned by `getPlatformProxy`

- [#5569](https://github.com/cloudflare/workers-sdk/pull/5569) [`75ba960`](https://github.com/cloudflare/workers-sdk/commit/75ba9608faa9e5710fe1dc75b5852ae446696245) Thanks [@penalosa](https://github.com/penalosa)! - fix: Simplify `wrangler pages download config`:

  - Don't include inheritable keys in the production override if they're equal to production
  - Only create a preview environment if needed, otherwise put the preview config at the top level

## 3.63.1

### Patch Changes

- [#6192](https://github.com/cloudflare/workers-sdk/pull/6192) [`b879ce4`](https://github.com/cloudflare/workers-sdk/commit/b879ce49aff454f9fe34f86886fc97db8ff8083e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: do not report D1 user errors to Sentry

- [#6150](https://github.com/cloudflare/workers-sdk/pull/6150) [`d993409`](https://github.com/cloudflare/workers-sdk/commit/d9934090594a7101912bd35aacc86ceb4cc15c3a) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Fix `pages dev` watch mode [_worker.js]

  The watch mode in `pages dev` for Advanced Mode projects is currently partially broken, as it only watches for changes in the "\_worker.js" file, but not for changes in any of its imported dependencies. This means that given the following "\_worker.js" file

  ```
  import { graham } from "./graham-the-dog";
  export default {
  	fetch(request, env) {
  		return new Response(graham)
  	}
  }
  ```

  `pages dev` will reload for any changes in the `_worker.js` file itself, but not for any changes in `graham-the-dog.js`, which is its dependency.

  Similarly, `pages dev` will not reload for any changes in non-JS module imports, such as wasm/html/binary module imports.

  This commit fixes all the aforementioned issues.

## 3.63.0

### Minor Changes

- [#6167](https://github.com/cloudflare/workers-sdk/pull/6167) [`e048958`](https://github.com/cloudflare/workers-sdk/commit/e048958778bf8c43a0a23c0f555c1538acc32f09) Thanks [@threepointone](https://github.com/threepointone)! - feature: alias modules in the worker

  Sometimes, users want to replace modules with other modules. This commonly happens inside a third party dependency itself. As an example, a user might have imported `node-fetch`, which will probably never work in workerd. You can use the alias config to replace any of these imports with a module of your choice.

  Let's say you make a `fetch-nolyfill.js`

  ```ts
  export default fetch; // all this does is export the standard fetch function`
  ```

  You can then configure `wrangler.toml` like so:

  ```toml
  # ...
  [alias]
  "node-fetch": "./fetch-nolyfill"
  ```

  So any calls to `import fetch from 'node-fetch';` will simply use our nolyfilled version.

  You can also pass aliases in the cli (for both `dev` and `deploy`). Like:

  ```bash
  npx wrangler dev --alias node-fetch:./fetch-nolyfill
  ```

- [#6073](https://github.com/cloudflare/workers-sdk/pull/6073) [`7ed675e`](https://github.com/cloudflare/workers-sdk/commit/7ed675e3a43cfd996496bf1be2b31d34bde36664) Thanks [@geelen](https://github.com/geelen)! - Added D1 export support for local databases

### Patch Changes

- [#6149](https://github.com/cloudflare/workers-sdk/pull/6149) [`35689ea`](https://github.com/cloudflare/workers-sdk/commit/35689ead46379a50008af3d83ddaae16617cfbd4) Thanks [@RamIdeas](https://github.com/RamIdeas)! - refactor: React-free hotkeys implementation, behind the `--x-dev-env` flag

- [#6022](https://github.com/cloudflare/workers-sdk/pull/6022) [`7951815`](https://github.com/cloudflare/workers-sdk/commit/795181509a4735b16f426ac02873f04c208116c8) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Fix `pages dev` watch mode [Functions]

  The watch mode in `pages dev` for Pages Functions projects is currently partially broken, as it only watches for file system changes in the
  "/functions" directory, but not for changes in any of the Functions' dependencies. This means that given a Pages Function `math-is-fun.ts`, defined as follows:

  ```
  import { ADD } from "../math/add";

  export async function onRequest() {
  	return new Response(`${ADD} is fun!`);
  }
  ```

  `pages dev` will reload for any changes in `math-is-fun.ts` itself, but not for any changes in `math/add.ts`, which is its dependency.

  Similarly, `pages dev` will not reload for any changes in non-JS module imports, such as wasm/html/binary module imports.

  This commit fixes all these things, plus adds some extra polish to the `pages dev` watch mode experience.

- [#6164](https://github.com/cloudflare/workers-sdk/pull/6164) [`4cdad9b`](https://github.com/cloudflare/workers-sdk/commit/4cdad9bf3870519efa46b34ecd928f26bf5cfa0f) Thanks [@threepointone](https://github.com/threepointone)! - fix: use account id for listing zones

  Fixes https://github.com/cloudflare/workers-sdk/issues/4944

  Trying to fetch `/zones` fails when it spans more than 500 zones. The fix to use an account id when doing so. This patch passes the account id to the zones call, threading it through all the functions that require it.

- [#6180](https://github.com/cloudflare/workers-sdk/pull/6180) [`b994604`](https://github.com/cloudflare/workers-sdk/commit/b9946049b0cfe273b8d950f5abcb25ddd386a872) Thanks [@Skye-31](https://github.com/Skye-31)! - Fix: pass env to getBindings to support reading `.dev.vars.{environment}`

  https://github.com/cloudflare/workers-sdk/pull/5612 added support for selecting the environment of config used, but it missed passing it to the code that reads `.dev.vars.{environment}`

  Closes #5641

- [#6124](https://github.com/cloudflare/workers-sdk/pull/6124) [`d03b102`](https://github.com/cloudflare/workers-sdk/commit/d03b10272513e5860c4aab338e2acecd18a990d8) Thanks [@RamIdeas](https://github.com/RamIdeas)! - feat: `url` and `inspectorUrl` properties have been exposed on the worker object returned by `new unstable_DevEnv().startWorker(options)`

- [#6147](https://github.com/cloudflare/workers-sdk/pull/6147) [`02dda3d`](https://github.com/cloudflare/workers-sdk/commit/02dda3d4d130bb9282e73499a78e04945b941ada) Thanks [@penalosa](https://github.com/penalosa)! - refactor: React free dev registry

- [#6127](https://github.com/cloudflare/workers-sdk/pull/6127) [`1568c25`](https://github.com/cloudflare/workers-sdk/commit/1568c251112e06feb1d3d1df844eaa660bb9fbe8) Thanks [@DaniFoldi](https://github.com/DaniFoldi)! - fix: Bump ws dependency

- [#6140](https://github.com/cloudflare/workers-sdk/pull/6140) [`4072114`](https://github.com/cloudflare/workers-sdk/commit/4072114c8ba03f35d36d14061d9a9919d61c91d5) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add extra error logging to auth response errors

- [#6160](https://github.com/cloudflare/workers-sdk/pull/6160) [`9466531`](https://github.com/cloudflare/workers-sdk/commit/9466531e858ffe184ad22651a8f67999398f8a55) Thanks [@sm-bean](https://github.com/sm-bean)! - fix: removes unnecessary wrangler tail warning against resetting durable object

  fixes https://jira.cfdata.org/browse/STOR-3318

- [#6142](https://github.com/cloudflare/workers-sdk/pull/6142) [`9272ef5`](https://github.com/cloudflare/workers-sdk/commit/9272ef5511c2882aed6525564c1b13c3d4a3f7e5) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: improve the `getPlatformProxy` `configPath` option ts-doc comment to clarify its behavior

- Updated dependencies [[`42a7930`](https://github.com/cloudflare/workers-sdk/commit/42a7930c6d81610c14005503c078610f28b9bc33), [`7ed675e`](https://github.com/cloudflare/workers-sdk/commit/7ed675e3a43cfd996496bf1be2b31d34bde36664), [`1568c25`](https://github.com/cloudflare/workers-sdk/commit/1568c251112e06feb1d3d1df844eaa660bb9fbe8)]:
  - miniflare@3.20240701.0

## 3.62.0

### Minor Changes

- [#5950](https://github.com/cloudflare/workers-sdk/pull/5950) [`0075621`](https://github.com/cloudflare/workers-sdk/commit/007562109b583adb6ae15bba5f50029735af24e5) Thanks [@WalshyDev](https://github.com/WalshyDev)! - feat: add `wrangler versions secret put`, `wrangler versions secret bulk` and `wrangler versions secret list`

  `wrangler versions secret put` allows for you to add/update a secret even if the latest version is not fully deployed. A new version with this secret will be created, the existing secrets and config are copied from the latest version.

  `wrangler versions secret bulk` allows you to bulk add/update multiple secrets at once, this behaves the same as `secret put` and will only make one new version.

  `wrangler versions secret list` lists the secrets available to the currently deployed versions. `wrangler versions secret list --latest-version` or `wrangler secret list` will list for the latest version.

  Additionally, we will now prompt for extra confirmation if attempting to rollback to a version with different secrets than the currently deployed.

### Patch Changes

- [#6118](https://github.com/cloudflare/workers-sdk/pull/6118) [`1621992`](https://github.com/cloudflare/workers-sdk/commit/162199289d51dbaf3f7a371d777012d0039fbdfb) Thanks [@WalshyDev](https://github.com/WalshyDev)! - fix: rollback in the case of a secret change, the prompt meant to show was not showing due to the spinner in an interactive env. It will now properly show.

  chore: improve the view of `wrangler versions view` and change up copy a little for `versions secret` commands.

- [#6105](https://github.com/cloudflare/workers-sdk/pull/6105) [`26855f3`](https://github.com/cloudflare/workers-sdk/commit/26855f39ae635feebb9d5768b64494e73d979b47) Thanks [@helloimalastair](https://github.com/helloimalastair)! - feat: Add help messages to all invalid `r2` commands

- [#3735](https://github.com/cloudflare/workers-sdk/pull/3735) [`9c7df38`](https://github.com/cloudflare/workers-sdk/commit/9c7df38871b9fcfda4890a00507e6ef149e0cbcd) Thanks [@lrapoport-cf](https://github.com/lrapoport-cf)! - chore: Cleanup `wrangler --help` output

  This commit cleans up and standardizes the look and feel of all `wrangler` commands as displayed by `wrangler --help` and `wrangler <cmd> --help`.

- [#6080](https://github.com/cloudflare/workers-sdk/pull/6080) [`e2972cf`](https://github.com/cloudflare/workers-sdk/commit/e2972cf2ce785f5d56b1476e30102e05febba320) Thanks [@threepointone](https://github.com/threepointone)! - chore: run eslint (with react config) on workers-playground/wrangler

  This enables eslint (with our react config) for the workers-playground project. Additionally, this enables the react-jsx condition in relevant tsconfig/eslint config, letting us write jsx without having React in scope.

- [#6001](https://github.com/cloudflare/workers-sdk/pull/6001) [`d39d595`](https://github.com/cloudflare/workers-sdk/commit/d39d59589f7fe3102276bad6b93caf10c39e5f20) Thanks [@penalosa](https://github.com/penalosa)! - chore: changes to how `wrangler dev` launches your worker, behind the experimental `--x-dev-env` flag

- [#5214](https://github.com/cloudflare/workers-sdk/pull/5214) [`05c5607`](https://github.com/cloudflare/workers-sdk/commit/05c56073b4e8c71ab6e0b287adddddc00d763170) Thanks [@penalosa](https://github.com/penalosa)! - feat: Experimental file based service discovery when running multiple Wrangler instances locally. To try it out, make sure all your local Wrangler instances are running with the `--x-registry` flag.

- Updated dependencies [[`7d02856`](https://github.com/cloudflare/workers-sdk/commit/7d02856ae2cbd90eb94324f9f6fcb44cd2c44059), [`d4e1e9f`](https://github.com/cloudflare/workers-sdk/commit/d4e1e9fc3439c3d6bd2d1d145d3edc85b551f276)]:
  - miniflare@3.20240620.0
  - @cloudflare/kv-asset-handler@0.3.4

## 3.61.0

### Minor Changes

- [#5995](https://github.com/cloudflare/workers-sdk/pull/5995) [`374bc44`](https://github.com/cloudflare/workers-sdk/commit/374bc44cce65e2f83f10452122719d3ab28827b3) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: allow Durable Object migrations to be overridable in environments

  By making the `migrations` key inheritable, users can provide different migrations
  for each wrangler.toml environment.

  Resolves [#729](https://github.com/cloudflare/workers-sdk/issues/729)

### Patch Changes

- [#6039](https://github.com/cloudflare/workers-sdk/pull/6039) [`dc597a3`](https://github.com/cloudflare/workers-sdk/commit/dc597a38218b428141c55c4e65633953c87ed180) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: hybrid nodejs compat now supports requiring the default export of a CJS module

  Fixes [#6028](https://github.com/cloudflare/workers-sdk/issues/6028)

- [#6051](https://github.com/cloudflare/workers-sdk/pull/6051) [`15aff8f`](https://github.com/cloudflare/workers-sdk/commit/15aff8f6e6ce533f25495193e702a6bec76fa81c) Thanks [@threepointone](https://github.com/threepointone)! - fix: Don't check expiry dates on custom certs

  Fixes https://github.com/cloudflare/workers-sdk/issues/5964

  For `wrangler dev`, we don't have to check whether certificates have expired when they're provided by the user.

- [#6052](https://github.com/cloudflare/workers-sdk/pull/6052) [`b4c0233`](https://github.com/cloudflare/workers-sdk/commit/b4c02333829c2312f883e897f812f9877dba603a) Thanks [@threepointone](https://github.com/threepointone)! - chore: Add `.wrangler` and `.DS_Store` to `.gitignore` generated by `wrangler init`

  This commit adds a small QOL improvement to `init` (to be deprecated in the future), for those who still use this wrangler command.

- [#6050](https://github.com/cloudflare/workers-sdk/pull/6050) [`a0c3327`](https://github.com/cloudflare/workers-sdk/commit/a0c3327dd63059d3e24085a95f48f8a98605c49f) Thanks [@threepointone](https://github.com/threepointone)! - chore: Normalize more deps

  This is the last of the patches that normalize dependencies across the codebase. In this batch: `ws`, `vitest`, `zod` , `rimraf`, `@types/rimraf`, `ava`, `source-map`, `glob`, `cookie`, `@types/cookie`, `@microsoft/api-extractor`, `@types/mime`, `@types/yargs`, `devtools-protocol`, `@vitest/ui`, `execa`, `strip-ansi`

  This patch also sorts dependencies in every `package.json`

- [#6029](https://github.com/cloudflare/workers-sdk/pull/6029) [`f5ad1d3`](https://github.com/cloudflare/workers-sdk/commit/f5ad1d3e562ce63b59f6ab136f1cdd703605bca4) Thanks [@threepointone](https://github.com/threepointone)! - chore: Normalize some dependencies in workers-sdk

  This is the first of a few expected patches that normalize dependency versions, This normalizes `undici`, `concurrently`, `@types/node`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `eslint`, `typescript`. There are no functional code changes (but there are a couple of typecheck fixes).

- [#6046](https://github.com/cloudflare/workers-sdk/pull/6046) [`c643a81`](https://github.com/cloudflare/workers-sdk/commit/c643a8193a3c0739b33d3c0072ae716bc8f1565b) Thanks [@threepointone](https://github.com/threepointone)! - chore: Normalize more dependencies.

  Follow up to https://github.com/cloudflare/workers-sdk/pull/6029, this normalizes some more dependencies : `get-port`, `chalk`, `yargs`, `toucan-js`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `esbuild-register`, `hono`, `glob-to-regexp`, `@cloudflare/workers-types`

- [#6058](https://github.com/cloudflare/workers-sdk/pull/6058) [`31cd51f`](https://github.com/cloudflare/workers-sdk/commit/31cd51f251050b0d6db97857a8d1d5427c855d99) Thanks [@threepointone](https://github.com/threepointone)! - chore: Quieter builds

  This patch cleans up warnings we were seeing when doing a full build. Specifically:

  - fixtures/remix-pages-app had a bunch of warnings about impending features that it should be upgraded to, so I did that. (tbh this one needs a full upgrade of packages, but we'll get to that later when we're upgrading across the codebase)
  - updated `@microsoft/api-extractor` so it didn't complain that it didn't match the `typescript` version (that we'd recently upgraded)
  - it also silenced a bunch of warnings when exporting types from `wrangler`. We'll need to fix those, but we'll do that when we work on unstable_dev etc.
  - workers-playground was complaining about the size of the bundle being generated, so I increased the limit on it

- [#6043](https://github.com/cloudflare/workers-sdk/pull/6043) [`db66101`](https://github.com/cloudflare/workers-sdk/commit/db661015d37ce75c021413e3ca7c4f0488790cbc) Thanks [@threepointone](https://github.com/threepointone)! - fix: avoid esbuild warning when running dev/bundle

  I've been experimenting with esbuild 0.21.4 with wrangler. It's mostly been fine. But I get this warning every time

  ```
  ▲ [WARNING] Import "__INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__" will always be undefined because there is no matching export in "src/index.ts" [import-is-undefined]

      .wrangler/tmp/bundle-Z3YXTd/middleware-insertion-facade.js:8:23:
        8 │ .....(OTHER_EXPORTS.__INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__ ?? []),
          ╵
  ```

  This is because esbuild@0.18.5 enabled a warning by default whenever an undefined import is accessed on an imports object. However we abuse imports to inject stuff in `middleware.test.ts`. A simple fix is to only inject that code in tests.

- [#6062](https://github.com/cloudflare/workers-sdk/pull/6062) [`267761b`](https://github.com/cloudflare/workers-sdk/commit/267761b3f5a60e9ea72067d42302895f9d459460) Thanks [@WalshyDev](https://github.com/WalshyDev)! - fix: typo in `wrangler d1 execute` saying "Databas" instead of "Database"

- [#6064](https://github.com/cloudflare/workers-sdk/pull/6064) [`84e6aeb`](https://github.com/cloudflare/workers-sdk/commit/84e6aeb189a4f385c49b7c6d451d0613186b29be) Thanks [@helloimalastair](https://github.com/helloimalastair)! - fix: Wrangler is now able to upload files to local R2 buckets above the 300 MiB limit

- Updated dependencies [[`a0c3327`](https://github.com/cloudflare/workers-sdk/commit/a0c3327dd63059d3e24085a95f48f8a98605c49f), [`f5ad1d3`](https://github.com/cloudflare/workers-sdk/commit/f5ad1d3e562ce63b59f6ab136f1cdd703605bca4), [`31cd51f`](https://github.com/cloudflare/workers-sdk/commit/31cd51f251050b0d6db97857a8d1d5427c855d99)]:
  - miniflare@3.20240610.1
  - @cloudflare/kv-asset-handler@0.3.3

## 3.60.3

### Patch Changes

- [#6025](https://github.com/cloudflare/workers-sdk/pull/6025) [`122ef06`](https://github.com/cloudflare/workers-sdk/commit/122ef0681a8aa5338993cb21f111f84ef5c3a443) Thanks [@IgorMinar](https://github.com/IgorMinar)! - fix: avoid path collisions between performance and Performance Node.js polyfills

  It turns out that ESBuild paths are case insensitive, which can result in path collisions between polyfills for `globalThis.performance` and `globalThis.Performance`, etc.

  This change ensures that we encode all global names to lowercase and decode them appropriately.

- [#6009](https://github.com/cloudflare/workers-sdk/pull/6009) [`169a9fa`](https://github.com/cloudflare/workers-sdk/commit/169a9fa260b7cb76cf5ef9e9e29a4fd33af8cf2f) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: reduce the number of parallel file reads on Windows to avoid EMFILE type errors

  Fixes #1586

- [`53acdbc`](https://github.com/cloudflare/workers-sdk/commit/53acdbc00a95e621d90d225d943c36df41768571) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: warn if user tries normal deploy when in the middle of a gradual version rollout

- Updated dependencies [[`c4146fc`](https://github.com/cloudflare/workers-sdk/commit/c4146fc021cbb0556cc95899184b7a44d58ad77c)]:
  - miniflare@3.20240610.0

## 3.60.2

### Patch Changes

- [#5307](https://github.com/cloudflare/workers-sdk/pull/5307) [`e6a3d24`](https://github.com/cloudflare/workers-sdk/commit/e6a3d243a73f0101d57e6e35c25585884ebea674) Thanks [@achanda](https://github.com/achanda)! - fix: add more timePeriods to `wrangler d1 insights`

  This PR updates `wrangler d1 insights` to accept arbitrary timePeriod values up to 31 days.

## 3.60.1

### Patch Changes

- [#6002](https://github.com/cloudflare/workers-sdk/pull/6002) [`f1f1834`](https://github.com/cloudflare/workers-sdk/commit/f1f18347ddfff509a58acea2a815c40fe86fd56c) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Revert a change in 3.60.0 which incorrectly batched assets for Pages uploads (https://github.com/cloudflare/workers-sdk/pull/5632).

## 3.60.0 [DEPRECATED]

### Minor Changes

- [#5878](https://github.com/cloudflare/workers-sdk/pull/5878) [`1e68fe5`](https://github.com/cloudflare/workers-sdk/commit/1e68fe5448ffa4d0551dc7255405983c329235c8) Thanks [@IgorMinar](https://github.com/IgorMinar)! - feat: add experimental support for hybrid Node.js compatibility

  _This feature is experimental and not yet available for general consumption._

  Use a combination of workerd Node.js builtins (behind the `experimental:nodejs_compat_v2` flag) and
  Unenv polyfills (configured to only add those missing from the runtime) to provide a new more effective
  Node.js compatibility approach.

- [#5988](https://github.com/cloudflare/workers-sdk/pull/5988) [`e144f63`](https://github.com/cloudflare/workers-sdk/commit/e144f63f8c418c77a3b73d387f7e7d22e8f1f730) Thanks [@RamIdeas](https://github.com/RamIdeas)! - feature: rename the `wrangler secret:bulk` command to `wrangler secret bulk`

  The old command is now deprecated (but still functional) and will be removed in a future release. The new command is now more consistent with the rest of the wrangler CLI commands.

- [#5989](https://github.com/cloudflare/workers-sdk/pull/5989) [`35b1a2f`](https://github.com/cloudflare/workers-sdk/commit/35b1a2f59bf0849e65782a278463cd0c3d294817) Thanks [@RamIdeas](https://github.com/RamIdeas)! - feature: rename `wrangler kv:...` commands to `wrangler kv ...`

  The old commands are now deprecated (but still functional) and will be removed in a future release. The new commands are now more consistent with the rest of the wrangler CLI commands.

- [#5861](https://github.com/cloudflare/workers-sdk/pull/5861) [`1cc52f1`](https://github.com/cloudflare/workers-sdk/commit/1cc52f14c70112f5257263a4adee0c54add3a00d) Thanks [@zebp](https://github.com/zebp)! - feat: allow for Pages projects to upload sourcemaps

  Pages projects can now upload sourcemaps for server bundles to enable remapped stacktraces in realtime logs when deployed with `upload_source_map` set to `true` in `wrangler.toml`.

### Patch Changes

- [#5939](https://github.com/cloudflare/workers-sdk/pull/5939) [`21573f4`](https://github.com/cloudflare/workers-sdk/commit/21573f4fd3484145405c5666b4dc9f7338f56887) Thanks [@penalosa](https://github.com/penalosa)! - refactor: Adds the experimental flag `--x-dev-env` which opts in to using an experimental code path for `wrangler dev` and `wrangler dev --remote`. There should be no observable behaviour changes when this flag is enabled.

- [#5934](https://github.com/cloudflare/workers-sdk/pull/5934) [`bac79fb`](https://github.com/cloudflare/workers-sdk/commit/bac79fb7379941cd70d3a99d0d2cdb23e2409e50) Thanks [@dbenCF](https://github.com/dbenCF)! - fix: Update create KV namespace binding details message for easier implementation

- [#5927](https://github.com/cloudflare/workers-sdk/pull/5927) [`6f83641`](https://github.com/cloudflare/workers-sdk/commit/6f836416446e3c04656d17477bcbbd39386622b5) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Clean `pages dev` terminal ouput

  This work includes a series of improvements to the `pages dev` terminal output, in an attempt to make this output more structured, organised, cleaner, easier to follow, and therefore more helpful for our users <3

- [#5960](https://github.com/cloudflare/workers-sdk/pull/5960) [`e648825`](https://github.com/cloudflare/workers-sdk/commit/e6488257f9376d415d970b045d77f0223d2f7884) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: avoid injecting esbuild watch stubs into production Worker code

  When we added the ability to include additional modules in the deployed bundle of a Worker,
  we inadvertently also included some boiler plate code that is only needed at development time.

  This fix ensures that this code is only injected if we are running esbuild in watch mode
  (e.g. `wrangler dev`) and not when building for deployment.

  It is interesting to note that this boilerplate only gets included in the production code
  if there is an import of CommonJS code in the Worker, which esbuild needs to convert to an
  ESM import.

  Fixes [#4269](https://github.com/cloudflare/workers-sdk/issues/4269)

- Updated dependencies [[`ab95473`](https://github.com/cloudflare/workers-sdk/commit/ab9547380fd6fbc1d20c8dd4211faedbe94e5b33)]:
  - miniflare@3.20240605.0

## 3.59.0

### Minor Changes

- [#5963](https://github.com/cloudflare/workers-sdk/pull/5963) [`bf803d7`](https://github.com/cloudflare/workers-sdk/commit/bf803d74c2bd1fc9f6e090bad08db09c6ff88246) Thanks [@Skye-31](https://github.com/Skye-31)! - Feature: Add support for hiding the `"unsafe" fields are experimental` warning using an environment variable

  By setting `WRANGLER_DISABLE_EXPERIMENTAL_WARNING` to any truthy value, these warnings will be hidden.

### Patch Changes

- Updated dependencies [[`bdbb7f8`](https://github.com/cloudflare/workers-sdk/commit/bdbb7f890d3fa5b6fa7ac79a3bb650ece9417fb2)]:
  - miniflare@3.20240524.2

## 3.58.0

### Minor Changes

- [#5933](https://github.com/cloudflare/workers-sdk/pull/5933) [`93b98cb`](https://github.com/cloudflare/workers-sdk/commit/93b98cb7e2ba5f73acbc20b4a3ca9a404a37a5dc) Thanks [@WalshyDev](https://github.com/WalshyDev)! - feature: allow for writing authentication details per API environment. This allows someone targetting staging to have their staging auth details saved separately from production, this saves them logging in and out when switching environments.

### Patch Changes

- [#5938](https://github.com/cloudflare/workers-sdk/pull/5938) [`9e4d8bc`](https://github.com/cloudflare/workers-sdk/commit/9e4d8bcb8811b9dc2570de26660baa4361a52749) Thanks [@threepointone](https://github.com/threepointone)! - fix: let "assets" in wrangler.toml be a string

  The experimental "assets" field can be either a string or an object. However the type definition marks it only as an object. This is a problem because we use this to generate the json schema, which gets picked up by vscode's even better toml extension, and shows it to be an error when used with a string (even though it works fine). The fix is to simply change the type definition to add a string variant.

- [#5758](https://github.com/cloudflare/workers-sdk/pull/5758) [`8e5e589`](https://github.com/cloudflare/workers-sdk/commit/8e5e5897f0de5f8a4990f88165d7a963018a06ef) Thanks [@Jackenmen](https://github.com/Jackenmen)! - fix: use correct type for AI binding instead of unknown

- Updated dependencies [[`e0e7725`](https://github.com/cloudflare/workers-sdk/commit/e0e772575c079787f56615ec3d7a6a4af0633b5a)]:
  - miniflare@3.20240524.1

## 3.57.2

### Patch Changes

- [#5905](https://github.com/cloudflare/workers-sdk/pull/5905) [`53f22a0`](https://github.com/cloudflare/workers-sdk/commit/53f22a086837df7130d165fe9243f2d1f1559d73) Thanks [@penalosa](https://github.com/penalosa)! - fix: Remove WARP certificate injection. Instead, you should ensure that any custom certificates that are needed are included in `NODE_EXTRA_CA_CERTS`.

- [#5930](https://github.com/cloudflare/workers-sdk/pull/5930) [`57daae0`](https://github.com/cloudflare/workers-sdk/commit/57daae0b2bd70c4f25b2abcabfc7fb03dba0c878) Thanks [@WalshyDev](https://github.com/WalshyDev)! - chore: improve error message when updating secret for a non-deployed latest version.

- [#5703](https://github.com/cloudflare/workers-sdk/pull/5703) [`a905f31`](https://github.com/cloudflare/workers-sdk/commit/a905f318166a9ceac1fb70487b3a47e5f4158780) Thanks [@penalosa](https://github.com/penalosa)! - fix: Don't use `ExportedHandler["middleware"]` for injecting middleware

- Updated dependencies [[`64ccdd6`](https://github.com/cloudflare/workers-sdk/commit/64ccdd6a6777c5fd85116af0d660cb3ee2e1de4d), [`4458a9e`](https://github.com/cloudflare/workers-sdk/commit/4458a9ea1a2b7748d6066557f48f68ec430d383b)]:
  - miniflare@3.20240524.0

## 3.57.1

### Patch Changes

- [#5859](https://github.com/cloudflare/workers-sdk/pull/5859) [`f2ceb3a`](https://github.com/cloudflare/workers-sdk/commit/f2ceb3a5b993fa56782a6fdf39cd73dbe5c30c83) Thanks [@w-kuhn](https://github.com/w-kuhn)! - fix: queue consumer max_batch_timeout should accept a 0 value

- [#5862](https://github.com/cloudflare/workers-sdk/pull/5862) [`441a05f`](https://github.com/cloudflare/workers-sdk/commit/441a05f4df10e73405a23031cd6a20073d0e15e6) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: `wrangler pages deploy` should fail if deployment was unsuccessful

  If a Pages project fails to deploy, `wrangler pages deploy` will log
  an error message, but exit successfully. It should instead throw a
  `FatalError`.

- [#5812](https://github.com/cloudflare/workers-sdk/pull/5812) [`d5e00e4`](https://github.com/cloudflare/workers-sdk/commit/d5e00e4a61a4232ebe01069a753ecb642c272b5d) Thanks [@thomasgauvin](https://github.com/thomasgauvin)! - fix: remove Hyperdrive warning for local development.

  Hyperdrive bindings are now supported when developing locally with Hyperdrive. We should update our logs to reflect this.

- [#5626](https://github.com/cloudflare/workers-sdk/pull/5626) [`a12b031`](https://github.com/cloudflare/workers-sdk/commit/a12b031e4157728e9b6e70667c16481fa32f401e) Thanks [@RamIdeas](https://github.com/RamIdeas)! - chore: ignore workerd output (error: CODE_MOVED) not intended for end-user devs

## 3.57.0

### Minor Changes

- [#5696](https://github.com/cloudflare/workers-sdk/pull/5696) [`7e97ba8`](https://github.com/cloudflare/workers-sdk/commit/7e97ba8778be3cf1d93d44ed191748853c6661e0) Thanks [@geelen](https://github.com/geelen)! - feature: Improved `d1 execute --file --remote` performance & added support for much larger SQL files within a single transaction.

- [#5819](https://github.com/cloudflare/workers-sdk/pull/5819) [`63f7acb`](https://github.com/cloudflare/workers-sdk/commit/63f7acb37e7e7ceb60594ac91baf95cd30037d76) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Show feedback on Pages project deployment failure

  Today, if uploading a Pages Function, or deploying a Pages project fails for whatever reason, there’s no feedback shown to the user. Worse yet, the shown message is misleading, saying the deployment was successful, when in fact it was not:

  ```
  ✨ Deployment complete!
  ```

  This commit ensures that we provide users with:

  - the correct feedback with respect to their Pages deployment
  - the appropriate messaging depending on the status of their project's deployment status
  - the appropriate logs in case of a deployment failure

- [#5814](https://github.com/cloudflare/workers-sdk/pull/5814) [`2869e03`](https://github.com/cloudflare/workers-sdk/commit/2869e0379667d755d1de5543cb80886cc42c211f) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Display correct global flags in `wrangler pages --help`

  Running `wrangler pages --help` will list, amongst others, the following global flags:

  ```
  -j, --experimental-json-config
  -c, --config
  -e, --env
  -h, --help
  -v, --version
  ```

  This is not accurate, since flags such as `--config`, `--experimental-json-config`, or `env` are not supported by Pages.

  This commit ensures we display the correct global flags that apply to Pages.

- [#5818](https://github.com/cloudflare/workers-sdk/pull/5818) [`df2daf2`](https://github.com/cloudflare/workers-sdk/commit/df2daf2c858229fd812bf1fe818b206ef1345a00) Thanks [@WalshyDev](https://github.com/WalshyDev)! - chore: Deprecate usage of the deployment object on the unsafe metadata binding in favor of the new version_metadata binding.

  If you're currently using the old binding, please move over to the new version_metadata binding by adding:

  ```toml
  [version_metadata]
  binding = "CF_VERSION_METADATA"
  ```

  and updating your usage accordingly. You can find the docs for the new binding here: https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata

### Patch Changes

- [#5838](https://github.com/cloudflare/workers-sdk/pull/5838) [`609debd`](https://github.com/cloudflare/workers-sdk/commit/609debdf744569278a050070846e420ffbfac161) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: update undici to the latest version to avoid a potential vulnerability

- [#5832](https://github.com/cloudflare/workers-sdk/pull/5832) [`86a6e09`](https://github.com/cloudflare/workers-sdk/commit/86a6e09d8a369a3bb8aee8c252174bd01e090c54) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: do not allow non-string values in bulk secret uploads

  Prior to Wrangler 3.4.0 we displayed an error if the user tried to upload a
  JSON file that contained non-string secrets, since these are not supported
  by the Cloudflare backend.

  This change reintroduces that check to give the user a helpful error message
  rather than a cryptic `workers.api.error.invalid_script_config` error code.

## 3.56.0

### Minor Changes

- [#5712](https://github.com/cloudflare/workers-sdk/pull/5712) [`151bc3d`](https://github.com/cloudflare/workers-sdk/commit/151bc3d31cb970a8caa84fad687c8b1b47ced73f) Thanks [@penalosa](https://github.com/penalosa)! - feat: Support `mtls_certificates` and `browser` bindings when using `wrangler.toml` with a Pages project

### Patch Changes

- [#5813](https://github.com/cloudflare/workers-sdk/pull/5813) [`9627cef`](https://github.com/cloudflare/workers-sdk/commit/9627cef2f1aadb44aa677e429b6cb6af9c8ee495) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Upload Pages project assets with more grace

  - Reduces the maximum bucket size from 50 MiB to 40 MiB.
  - Reduces the maximum asset count from 5000 to 2000.
  - Allows for more retries (with increased sleep between attempts) when encountering an API gateway failure.

- Updated dependencies [[`0725f6f`](https://github.com/cloudflare/workers-sdk/commit/0725f6f73199daf7f11eec9830bc4d1f66c05d62), [`89b6d7f`](https://github.com/cloudflare/workers-sdk/commit/89b6d7f3832b350b470a981eb3b4388517612363)]:
  - miniflare@3.20240512.0

## 3.55.0

### Minor Changes

- [#5570](https://github.com/cloudflare/workers-sdk/pull/5570) [`66bdad0`](https://github.com/cloudflare/workers-sdk/commit/66bdad08834b403100d1e4d6cd507978cc50eaba) Thanks [@sesteves](https://github.com/sesteves)! - feature: support delayed delivery in the miniflare's queue simulator.

  This change updates the miniflare's queue broker to support delayed delivery of messages, both when sending the message from a producer and when retrying the message from a consumer.

### Patch Changes

- [#5740](https://github.com/cloudflare/workers-sdk/pull/5740) [`97741db`](https://github.com/cloudflare/workers-sdk/commit/97741dbf8ff7498bcaa381361d61ad17af10f088) Thanks [@WalshyDev](https://github.com/WalshyDev)! - chore: log "Version ID" in `wrangler deploy`, `wrangler deployments list`, `wrangler deployments view` and `wrangler rollback` to support migration from the deprecated "Deployment ID". Users should update any parsing to use "Version ID" before "Deployment ID" is removed.

- [#5754](https://github.com/cloudflare/workers-sdk/pull/5754) [`f673c66`](https://github.com/cloudflare/workers-sdk/commit/f673c66373e2acd8d9cc94d5afa87b07dd3d750c) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: when using custom builds, the `wrangler dev` proxy server was sometimes left in a paused state

  This could be observed as the browser loading indefinitely, after saving a source file (unchanged) when using custom builds. This is now fixed by ensuring the proxy server is unpaused after a short timeout period.

- Updated dependencies [[`66bdad0`](https://github.com/cloudflare/workers-sdk/commit/66bdad08834b403100d1e4d6cd507978cc50eaba), [`9b4af8a`](https://github.com/cloudflare/workers-sdk/commit/9b4af8a59bc75ed494dd752c0a7007dbacf75e51)]:
  - miniflare@3.20240419.1

## 3.54.0

### Minor Changes

- [#5689](https://github.com/cloudflare/workers-sdk/pull/5689) [`19cac82`](https://github.com/cloudflare/workers-sdk/commit/19cac82233325d1f28eb02de53ea1a810bec3806) Thanks [@Ankcorn](https://github.com/Ankcorn)! - feat: Warn if unexpected key is in `wrangler.toml`

## 3.53.1

### Patch Changes

- [#5091](https://github.com/cloudflare/workers-sdk/pull/5091) [`6365c90`](https://github.com/cloudflare/workers-sdk/commit/6365c9077ed7f438a8f5fc827eae2ca04c2520e0) Thanks [@Cherry](https://github.com/Cherry)! - fix: better handle dashes and other invalid JS identifier characters in `wrangler types` generation for vars, bindings, etc.

  Previously, with the following in your `wrangler.toml`, an invalid types file would be generated:

  ```toml
  [vars]
  some-var = "foobar"
  ```

  Now, the generated types file will be valid:

  ```typescript
  interface Env {
  	"some-var": "foobar";
  }
  ```

- [#5748](https://github.com/cloudflare/workers-sdk/pull/5748) [`27966a4`](https://github.com/cloudflare/workers-sdk/commit/27966a43c65aa6046856d3b813af2d6797b894bf) Thanks [@penalosa](https://github.com/penalosa)! - fix: Load sourcemaps relative to the entry directory, not cwd.

- [#5746](https://github.com/cloudflare/workers-sdk/pull/5746) [`1dd9f7e`](https://github.com/cloudflare/workers-sdk/commit/1dd9f7eeea4df9141c766e52c31828cf201ab71b) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: suggest trying to update Wrangler if there is a newer one available after an unexpected error

- [#5226](https://github.com/cloudflare/workers-sdk/pull/5226) [`f63e7a5`](https://github.com/cloudflare/workers-sdk/commit/f63e7a55613d56381c7396cf55c248dc2a0ad305) Thanks [@DaniFoldi](https://github.com/DaniFoldi)! - fix: remove second Wrangler banner from `wrangler dispatch-namespace rename`

## 3.53.0

### Minor Changes

- [#5604](https://github.com/cloudflare/workers-sdk/pull/5604) [`327a456`](https://github.com/cloudflare/workers-sdk/commit/327a4568751a4046ff8794c72c658c074964a7c7) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - feat: add support for environments in `getPlatformProxy`

  allow `getPlatformProxy` to target environments by allowing users to specify an `environment` option

  Example usage:

  ```js
  const { env } = await getPlatformProxy({
  	environment: "production",
  });
  ```

### Patch Changes

- [#5705](https://github.com/cloudflare/workers-sdk/pull/5705) [`4097759`](https://github.com/cloudflare/workers-sdk/commit/4097759b6fbef4cd9aa81d3a6f01fc868ff50dd8) Thanks [@G4brym](https://github.com/G4brym)! - Add `staging` flag to AI binding

## 3.52.0

### Minor Changes

- [#5666](https://github.com/cloudflare/workers-sdk/pull/5666) [`81d9615`](https://github.com/cloudflare/workers-sdk/commit/81d961582da2db2b020305c63a9f1f1573ff873d) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Fix Pages config validation around Durable Objects

  Today Pages cannot deploy Durable Objects itself. For this reason it is mandatory that when declaring Durable Objects bindings in the config file, the `script_name` is specified. We are currently not failing validation if
  `script_name` is not specified but we should. These changes fix that.

### Patch Changes

- [#5610](https://github.com/cloudflare/workers-sdk/pull/5610) [`24840f6`](https://github.com/cloudflare/workers-sdk/commit/24840f67b6495a664f5463697aa49fa9478435b9) Thanks [@SuperchupuDev](https://github.com/SuperchupuDev)! - Mark `ts-json-schema-generator` as a dev dependency

- [#5669](https://github.com/cloudflare/workers-sdk/pull/5669) [`a7e36d5`](https://github.com/cloudflare/workers-sdk/commit/a7e36d503f442a8225ffdedef30b569a8a396663) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: fix broken Durable Object local proxying (when no `cf` property is present)

  A regression was introduced in wrangler 3.46.0 (https://github.com/cloudflare/workers-sdk/pull/5215)
  which made it so that missing `Request#cf` properties are serialized as `"undefined"`, this in turn
  throws a syntax parse error when such values are parsed via `JSON.parse` breaking the communication
  with Durable Object local proxies. Fix such issue by serializing missing `Request#cf` properties as
  `"{}"` instead.

- [#5616](https://github.com/cloudflare/workers-sdk/pull/5616) [`c6312b5`](https://github.com/cloudflare/workers-sdk/commit/c6312b5017279b31ce99c761e2063973f7d948bf) Thanks [@webbertakken](https://github.com/webbertakken)! - fix: broken link to durable object migrations docs

- [#5482](https://github.com/cloudflare/workers-sdk/pull/5482) [`1b7739e`](https://github.com/cloudflare/workers-sdk/commit/1b7739e0af99860aa063f01c0a6e7712ac072fdb) Thanks [@DaniFoldi](https://github.com/DaniFoldi)! - docs: show new Discord url everywhere for consistency. The old URL still works, but https://discord.cloudflare.com is preferred.

- Updated dependencies [[`3a0d735`](https://github.com/cloudflare/workers-sdk/commit/3a0d7356bd8bc6fe614a3ef3f9c1278659555568), [`1b7739e`](https://github.com/cloudflare/workers-sdk/commit/1b7739e0af99860aa063f01c0a6e7712ac072fdb)]:
  - miniflare@3.20240419.0
  - @cloudflare/kv-asset-handler@0.3.2

## 3.51.2

### Patch Changes

- [#5652](https://github.com/cloudflare/workers-sdk/pull/5652) [`ccb9d3d`](https://github.com/cloudflare/workers-sdk/commit/ccb9d3d4efba73a720945df4e1212a010fe40739) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - chore: re-release due to broken build

## 3.51.1

### Patch Changes

- [#5640](https://github.com/cloudflare/workers-sdk/pull/5640) [`bd2031b`](https://github.com/cloudflare/workers-sdk/commit/bd2031bd5e1304ea104f84f3aa20d231a81f83b1) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: display user-friendly message when Pages function route param names are invalid.

  Param names can only contain alphanumeric and underscore characters. Previously the user would see a confusing error message similar to:

  ```
   TypeError: Unexpected MODIFIER at 8, expected END
  ```

  Now the user is given an error similar to:

  ```
  Invalid Pages function route parameter - "[hyphen-not-allowed]". Parameter names must only contain alphanumeric and underscore characters.
  ```

  Fixes #5540

- [#5619](https://github.com/cloudflare/workers-sdk/pull/5619) [`6fe0af4`](https://github.com/cloudflare/workers-sdk/commit/6fe0af46da3ff2262c99e46d287db64506233b43) Thanks [@gmemstr](https://github.com/gmemstr)! - fix: correctly handle non-text based files for kv put

  The current version of the kv:key put command with the --path argument will treat file contents as a string because it is not one of Blob or File when passed to the form helper library. We should turn it into a Blob so it's not mangling inputs.

## 3.51.0

### Minor Changes

- [#5477](https://github.com/cloudflare/workers-sdk/pull/5477) [`9a46e03`](https://github.com/cloudflare/workers-sdk/commit/9a46e03f013cc6f1e2d38d47f9bf002626b6bd95) Thanks [@pmiguel](https://github.com/pmiguel)! - feature: Changed Queues client to use the new QueueId and ConsumerId-based endpoints.

- [#5172](https://github.com/cloudflare/workers-sdk/pull/5172) [`fbe1c9c`](https://github.com/cloudflare/workers-sdk/commit/fbe1c9c816f2b5774060d721ff830e70d9b7d29f) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Allow marking external modules (with `--external`) to avoid bundling them when building Pages Functions

  It's useful for Pages Plugins which want to declare a peer dependency.

### Patch Changes

- [#5585](https://github.com/cloudflare/workers-sdk/pull/5585) [`22f5841`](https://github.com/cloudflare/workers-sdk/commit/22f58414d5697730f0337d17c7602b7fa3bebb79) Thanks [@geelen](https://github.com/geelen)! - Updates `wrangler d1 export` to handle larger DBs more efficiently

- Updated dependencies [[`c9f081a`](https://github.com/cloudflare/workers-sdk/commit/c9f081ab72142060a3cf2e9a7ef4546b8014b210), [`c9f081a`](https://github.com/cloudflare/workers-sdk/commit/c9f081ab72142060a3cf2e9a7ef4546b8014b210)]:
  - miniflare@3.20240405.2

## 3.50.0

### Minor Changes

- [#5587](https://github.com/cloudflare/workers-sdk/pull/5587) [`d95450f`](https://github.com/cloudflare/workers-sdk/commit/d95450f0b00fa32d4c827fc8ad25d8fc929a654d) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: `pages functions build-env` should throw error if invalid Pages config file is found

- [#5572](https://github.com/cloudflare/workers-sdk/pull/5572) [`65aa21c`](https://github.com/cloudflare/workers-sdk/commit/65aa21cc2d53b99e4c6956a3fb69bd687a102266) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: fix `pages function build-env` to exit with code rather than throw fatal error

  Currently pages functions build-env throws a fatal error if a config file does not exit, or if it is invalid. This causes issues for the CI system. We should instead exit with a specific code, if any of those situations arises.

- [#5291](https://github.com/cloudflare/workers-sdk/pull/5291) [`ce00a44`](https://github.com/cloudflare/workers-sdk/commit/ce00a44c985859a5ffb5ee3dc392796e5d12ff1d) Thanks [@pmiguel](https://github.com/pmiguel)! - feature: Added bespoke OAuth scope for Queues management.

### Patch Changes

- Updated dependencies [[`08b4908`](https://github.com/cloudflare/workers-sdk/commit/08b490806093add445ff3d7b1969923cb4123d34)]:
  - miniflare@3.20240405.1

## 3.49.0

### Minor Changes

- [#5549](https://github.com/cloudflare/workers-sdk/pull/5549) [`113ac41`](https://github.com/cloudflare/workers-sdk/commit/113ac41cda3bd6304c0683f6f8e61dcedf21e685) Thanks [@penalosa](https://github.com/penalosa)! - feat: Support `wrangler pages secret put|delete|list|bulk`

- [#5550](https://github.com/cloudflare/workers-sdk/pull/5550) [`4f47f74`](https://github.com/cloudflare/workers-sdk/commit/4f47f7422786e537eaefd034153998f848bcd573) Thanks [@penalosa](https://github.com/penalosa)! - feat: Generate a JSON schema for the Wrangler package & use it in templates

- [#5561](https://github.com/cloudflare/workers-sdk/pull/5561) [`59591cd`](https://github.com/cloudflare/workers-sdk/commit/59591cd5ace98bbfefd2ec34eb77dfeafd8db97d) Thanks [@ocsfrank](https://github.com/ocsfrank)! - feat: update R2 CreateBucket action to include the storage class in the request body

### Patch Changes

- [#5374](https://github.com/cloudflare/workers-sdk/pull/5374) [`7999dd2`](https://github.com/cloudflare/workers-sdk/commit/7999dd2bacf53be3780ba70492003d417ffcd5f0) Thanks [@maxwellpeterson](https://github.com/maxwellpeterson)! - fix: Improvements to `--init-from-dash`

  Adds user-specified CPU limit to `wrangler.toml` if one exists. Excludes `usage_model` from `wrangler.toml` in all cases, since this field is deprecated and no longer used.

- [#5553](https://github.com/cloudflare/workers-sdk/pull/5553) [`dcd65dd`](https://github.com/cloudflare/workers-sdk/commit/dcd65dd3da19f619cd9c48d42433ac538a734816) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: refactor d1's time-travel compatibility check

- [#5380](https://github.com/cloudflare/workers-sdk/pull/5380) [`57d5658`](https://github.com/cloudflare/workers-sdk/commit/57d5658bc5560f4ba38fd1b21a1988a4922feea2) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Respect `--no-bundle` when deploying a `_worker.js/` directory in Pages projects

- [#5536](https://github.com/cloudflare/workers-sdk/pull/5536) [`a7aa28a`](https://github.com/cloudflare/workers-sdk/commit/a7aa28ad57c07ea96aad1ddc547afb11db679878) Thanks [@Cherry](https://github.com/Cherry)! - fix: resolve a regression where `wrangler pages dev` would bind to port 8787 by default instead of 8788 since wrangler@3.38.0

- Updated dependencies [[`9575a51`](https://github.com/cloudflare/workers-sdk/commit/9575a514cbc206fea6d08f627253ead209fd2a8d)]:
  - miniflare@3.20240405.0

## 3.48.0

### Minor Changes

- [#5429](https://github.com/cloudflare/workers-sdk/pull/5429) [`c5561b7`](https://github.com/cloudflare/workers-sdk/commit/c5561b7236adf2b97e09e4ae9139654e23d635fe) Thanks [@ocsfrank](https://github.com/ocsfrank)! - R2 will introduce storage classes soon. Wrangler allows you to interact with storage classes once it is
  enabled on your account.

  Wrangler supports an `-s` flag that allows the user to specify a storage class when creating a bucket,
  changing the default storage class of a bucket, and uploading an object.

  ```bash
  wrangler r2 bucket create ia-bucket -s InfrequentAccess
  wrangler r2 bucket update storage-class my-bucket -s InfrequentAccess
  wrangler r2 object put bucket/ia-object -s InfrequentAccess --file foo
  ```

### Patch Changes

- [#5531](https://github.com/cloudflare/workers-sdk/pull/5531) [`887150a`](https://github.com/cloudflare/workers-sdk/commit/887150ae64d78800e1f44ea25d69f06e76e9f127) Thanks [@penalosa](https://github.com/penalosa)! - fix: Write `wrangler pages functions build-env` to file rather than stdout

- [#5526](https://github.com/cloudflare/workers-sdk/pull/5526) [`bafbd67`](https://github.com/cloudflare/workers-sdk/commit/bafbd6719bbec1e323ee161a0106bf98c60255a2) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: teach `wrangler d1 create` about Australia

## 3.47.1

### Patch Changes

- Updated dependencies [[`9f15ce1`](https://github.com/cloudflare/workers-sdk/commit/9f15ce1716c50dd44adf7a3df6a4101322800005)]:
  - miniflare@3.20240404.0

## 3.47.0

### Minor Changes

- [#5506](https://github.com/cloudflare/workers-sdk/pull/5506) [`7734f80`](https://github.com/cloudflare/workers-sdk/commit/7734f806c1ac2a38faabc87df4aa8344b585c430) Thanks [@penalosa](https://github.com/penalosa)! - feat: Add interactive prompt to `wrangler pages download config` if an existing `wrangler.toml` file exists

## 3.46.0

### Minor Changes

- [#5282](https://github.com/cloudflare/workers-sdk/pull/5282) [`b7ddde1`](https://github.com/cloudflare/workers-sdk/commit/b7ddde1a5165223dcbe8781e928039123778b8a1) Thanks [@maxwellpeterson](https://github.com/maxwellpeterson)! - feature: Add source map support for Workers

  Adds the `source_maps` boolean config option. When enabled, source maps included in the build output are uploaded alongside the built code modules. Uploaded source maps can then be used to remap stack traces emitted by the Workers runtime.

- [#5215](https://github.com/cloudflare/workers-sdk/pull/5215) [`cd03d1d`](https://github.com/cloudflare/workers-sdk/commit/cd03d1d3fa6e733faa42e5abb92f37637503b327) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feature: support named entrypoints in service bindings

  This change allows service bindings to bind to a named export of another Worker. As an example, consider the following Worker named `bound`:

  ```ts
  import { WorkerEntrypoint } from "cloudflare:workers";

  export class EntrypointA extends WorkerEntrypoint {
  	fetch(request) {
  		return new Response("Hello from entrypoint A!");
  	}
  }

  export const entrypointB: ExportedHandler = {
  	fetch(request, env, ctx) {
  		return new Response("Hello from entrypoint B!");
  	},
  };

  export default <ExportedHandler>{
  	fetch(request, env, ctx) {
  		return new Response("Hello from the default entrypoint!");
  	},
  };
  ```

  Up until now, you could only bind to the `default` entrypoint. With this change, you can bind to `EntrypointA` or `entrypointB` too using the new `entrypoint` option:

  ```toml
  [[services]]
  binding = "SERVICE"
  service = "bound"
  entrypoint = "EntrypointA"
  ```

  To bind to named entrypoints with `wrangler pages dev`, use the `#` character:

  ```shell
  $ wrangler pages dev --service=SERVICE=bound#EntrypointA
  ```

### Patch Changes

- [#5215](https://github.com/cloudflare/workers-sdk/pull/5215) [`cd03d1d`](https://github.com/cloudflare/workers-sdk/commit/cd03d1d3fa6e733faa42e5abb92f37637503b327) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: ensure request `url` and `cf` properties preserved across service bindings

  Previously, Wrangler could rewrite `url` and `cf` properties when sending requests via service bindings or Durable Object stubs. To match production behaviour, this change ensures these properties are preserved.

- Updated dependencies [[`cd03d1d`](https://github.com/cloudflare/workers-sdk/commit/cd03d1d3fa6e733faa42e5abb92f37637503b327), [`6c3be5b`](https://github.com/cloudflare/workers-sdk/commit/6c3be5b299b22cad050760a6015106839b5cc74e), [`cd03d1d`](https://github.com/cloudflare/workers-sdk/commit/cd03d1d3fa6e733faa42e5abb92f37637503b327), [`cd03d1d`](https://github.com/cloudflare/workers-sdk/commit/cd03d1d3fa6e733faa42e5abb92f37637503b327)]:
  - miniflare@3.20240403.0

## 3.45.0

### Minor Changes

- [#5377](https://github.com/cloudflare/workers-sdk/pull/5377) [`5d68744`](https://github.com/cloudflare/workers-sdk/commit/5d6874499049641c1d3d3f47161e7ebf3bc57650) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Add `wrangler.toml` support in `wrangler pages deploy`

  As we are adding `wrangler.toml` support for Pages, we want to ensure that `wrangler pages deploy` works with a configuration file.

- [#5471](https://github.com/cloudflare/workers-sdk/pull/5471) [`489b9c5`](https://github.com/cloudflare/workers-sdk/commit/489b9c51550d583d50e262f5905393501c2d6419) Thanks [@zebp](https://github.com/zebp)! - feature: Add version-id filter for Worker tailing to filter logs by scriptVersion in a gradual deployment

  This allows users to only get logs in a gradual deployment if you are troubleshooting issues
  specific to one deployment. Example:
  `npx wrangler tail --version-id 72d3f357-4e52-47c5-8805-90be978c403f`

### Patch Changes

- [#5462](https://github.com/cloudflare/workers-sdk/pull/5462) [`68faf67`](https://github.com/cloudflare/workers-sdk/commit/68faf67f0499927d7bded1342ccc9c8c9e76037a) Thanks [@OilyLime](https://github.com/OilyLime)! - revert: Removes support for private networking Hyperdrive configs, pending more work to support the feature. Non-breaking change since the feature wasn't yet supported.

- [#5494](https://github.com/cloudflare/workers-sdk/pull/5494) [`a232ccf`](https://github.com/cloudflare/workers-sdk/commit/a232ccffe6a2994df5181b6252965a7ba4a0c17a) Thanks [@penalosa](https://github.com/penalosa)! - fix: Swallow parsing errors when a pages config file is required.

- [#5484](https://github.com/cloudflare/workers-sdk/pull/5484) [`e7f8dc3`](https://github.com/cloudflare/workers-sdk/commit/e7f8dc32465921e0a9a38e8e3deeaf17c04c010a) Thanks [@ichernetsky-cf](https://github.com/ichernetsky-cf)! - feature: support Cloudchamber deployment labels

- [#5434](https://github.com/cloudflare/workers-sdk/pull/5434) [`bf9dca8`](https://github.com/cloudflare/workers-sdk/commit/bf9dca85a16c4133d2d200a9e2fc52dcf8917550) Thanks [@OilyLime](https://github.com/OilyLime)! - bugfix: Fix passing Hyperdrive caching options to backend

- [#5403](https://github.com/cloudflare/workers-sdk/pull/5403) [`5d6d521`](https://github.com/cloudflare/workers-sdk/commit/5d6d5218ba0686279e6b67d86592ece16949bf25) Thanks [@oliy](https://github.com/oliy)! - fix: wrangler dev --local support for ratelimits

- Updated dependencies [[`940ad89`](https://github.com/cloudflare/workers-sdk/commit/940ad89713fa086f23d394570c328716bfb1bd59)]:
  - miniflare@3.20240329.1

## 3.44.0

### Minor Changes

- [#5461](https://github.com/cloudflare/workers-sdk/pull/5461) [`f69e562`](https://github.com/cloudflare/workers-sdk/commit/f69e5629f8155186e7e890aa38509bb3fbfa704f) Thanks [@mattdeboard](https://github.com/mattdeboard)! - feature: Add command for fetching R2 Event Notification configurations for a given bucket

  This allows users to see the entire event notification configuration -- i.e. every rule for every configured queue -- for a single bucket with a single request.

  This change also improves messaging of console output when creating a new bucket notification.

### Patch Changes

- [#5480](https://github.com/cloudflare/workers-sdk/pull/5480) [`0cce21f`](https://github.com/cloudflare/workers-sdk/commit/0cce21ff5b27cc4c227e102eb470b0e0cae455bb) Thanks [@penalosa](https://github.com/penalosa)! - fix: Ensure url & node:url export URL (aliased to globalThis.URL) in node_compat mode

- [#5472](https://github.com/cloudflare/workers-sdk/pull/5472) [`02a1091`](https://github.com/cloudflare/workers-sdk/commit/02a109172e60446a8c8e79a2804fdd387c4525a5) Thanks [@penalosa](https://github.com/penalosa)! - fix: Expose more info from `wrangler pages functions build-env`

## 3.43.0

### Minor Changes

- [#5466](https://github.com/cloudflare/workers-sdk/pull/5466) [`ef9fbba`](https://github.com/cloudflare/workers-sdk/commit/ef9fbba36444fac665b95bedb2acd1fda494871b) Thanks [@celso](https://github.com/celso)! - feature: add Workers AI finetune commands

### Patch Changes

- [#5449](https://github.com/cloudflare/workers-sdk/pull/5449) [`91a2150`](https://github.com/cloudflare/workers-sdk/commit/91a2150b9e565d1d6519f635e19f36fc2dec0886) Thanks [@penalosa](https://github.com/penalosa)! - fix: Improve messaging for invalid Pages `wrangler.toml` files

## 3.42.0

### Minor Changes

- [#5371](https://github.com/cloudflare/workers-sdk/pull/5371) [`77152f3`](https://github.com/cloudflare/workers-sdk/commit/77152f355340d3aac492164fe912a7c5d7a3daeb) Thanks [@G4brym](https://github.com/G4brym)! - feature: remove requirement for `@cloudflare/ai` package to use Workers AI

  Previously, to get the correct Workers AI API, you needed to wrap your `env.AI` binding with `new Ai()` from `@cloudflare/ai`. This change moves the contents of `@cloudflare/ai` into the Workers runtime itself, meaning `env.AI` is now an instance of `Ai`, without the need for wrapping.

### Patch Changes

- Updated dependencies [[`d994066`](https://github.com/cloudflare/workers-sdk/commit/d994066f255f6851759a055eac3b52a4aa4b83c3)]:
  - miniflare@3.20240329.0

## 3.41.0

### Minor Changes

- [#5425](https://github.com/cloudflare/workers-sdk/pull/5425) [`b7a6d9d`](https://github.com/cloudflare/workers-sdk/commit/b7a6d9d422dbe1f09f35b5105a9a58dd425604a7) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: implement `wrangler d1 export`

## 3.40.0

### Minor Changes

- [#5426](https://github.com/cloudflare/workers-sdk/pull/5426) [`9343714`](https://github.com/cloudflare/workers-sdk/commit/9343714155d5fa71c7415457dd35ab343d047d0f) Thanks [@RamIdeas](https://github.com/RamIdeas)! - feature: added a new `wrangler triggers deploy` command

  This command currently requires the `--experimental-versions` flag.

  This command extracts the trigger deployment logic from `wrangler deploy` and allows users to update their currently deployed Worker's triggers without doing another deployment. This is primarily useful for users of `wrangler versions upload` and `wrangler versions deploy` who can then run `wrangler triggers deploy` to apply trigger changes to their currently deployed Worker Versions.

  The command can also be used even if not using the `wrangler versions ...` commands. And, in fact, users are already using it implicitly when running `wrangler deploy`.

- [#4932](https://github.com/cloudflare/workers-sdk/pull/4932) [`dc0c1dc`](https://github.com/cloudflare/workers-sdk/commit/dc0c1dc527c3ed2f79196f3b0ef44b337833a07a) Thanks [@xortive](https://github.com/xortive)! - feature: Add support for private networking in Hyperdrive configs

- [#5369](https://github.com/cloudflare/workers-sdk/pull/5369) [`7115568`](https://github.com/cloudflare/workers-sdk/commit/71155680d3675acd6f522e8b312aa63846a076a4) Thanks [@mattdeboard](https://github.com/mattdeboard)! - fix: Use queue name, not ID, for `r2 bucket event-notification` subcommands

  Since the original command was not yet operational, this update does not constitute a breaking change.

  Instead of providing the queue ID as the parameter to `--queue`, users must provide the queue _name_. Under the hood, we will query the Queues API for the queue ID given the queue name.

- [#5413](https://github.com/cloudflare/workers-sdk/pull/5413) [`976adec`](https://github.com/cloudflare/workers-sdk/commit/976adec23e3d993b190faf65f4f06b0508c5a22d) Thanks [@pmiguel](https://github.com/pmiguel)! - feature: Added Queue delivery controls support in wrangler.toml

- [#5412](https://github.com/cloudflare/workers-sdk/pull/5412) [`3e5a932`](https://github.com/cloudflare/workers-sdk/commit/3e5a932eca2e3e26d135e005967ca36801f27d97) Thanks [@RamIdeas](https://github.com/RamIdeas)! - feature: adds the `--json` option to `wrangler deployments list --experimental-versions`, `wrangler deployments status --experimental-versions`, `wrangler versions list --experimental-versions` and `wrangler versions view --experimental-versions` which will format the output as clean JSON. The ` --experimental-versions` flag is still required for these commands.

- [#5258](https://github.com/cloudflare/workers-sdk/pull/5258) [`fbdca7d`](https://github.com/cloudflare/workers-sdk/commit/fbdca7d93156f9db2a1513573e45f10fac7e57d1) Thanks [@OilyLime](https://github.com/OilyLime)! - feature: URL decode components of the Hyperdrive config connection string

- [#5416](https://github.com/cloudflare/workers-sdk/pull/5416) [`47b325a`](https://github.com/cloudflare/workers-sdk/commit/47b325af0df87bcf20d922ff385ae9cd21726863) Thanks [@mattdeboard](https://github.com/mattdeboard)! - fix: minor improvements to R2 notification subcommand

  1. `r2 bucket event-notification <subcommand>` becomes `r2 bucket notification <subcommand>`
  2. Parameters to `--event-type` use `-` instead of `_` (e.g. `object_create` -> `object-create`)

  Since the original command was not yet operational, this update does not constitute a breaking change.

### Patch Changes

- [#5419](https://github.com/cloudflare/workers-sdk/pull/5419) [`daac6a2`](https://github.com/cloudflare/workers-sdk/commit/daac6a2282c362a79990794dc00baca56ccc3e6e) Thanks [@RamIdeas](https://github.com/RamIdeas)! - chore: add helpful logging to --experimental-versions commands

- [#5400](https://github.com/cloudflare/workers-sdk/pull/5400) [`c90dd6b`](https://github.com/cloudflare/workers-sdk/commit/c90dd6b8a86238003ac953bd97566f92a206817d) Thanks [@RamIdeas](https://github.com/RamIdeas)! - chore: log of impending change of "Deployment ID" to "Version ID" in `wrangler deploy`, `wrangler deployments list`, `wrangler deployments view` and `wrangler rollback`. This is a warning of a future change for anyone depending on the output text format, for example by grepping the output in automated flows.

- [#5422](https://github.com/cloudflare/workers-sdk/pull/5422) [`b341614`](https://github.com/cloudflare/workers-sdk/commit/b3416145f3fc220aa833e24cbaa1c8612062e2de) Thanks [@geelen](https://github.com/geelen)! - fix: remove d1BetaWarning and all usages

  This PR removes the warning that D1 is in beta for all D1 commands.

- Updated dependencies [[`fbdca7d`](https://github.com/cloudflare/workers-sdk/commit/fbdca7d93156f9db2a1513573e45f10fac7e57d1)]:
  - miniflare@3.20240320.1

## 3.39.0

### Minor Changes

- [#5373](https://github.com/cloudflare/workers-sdk/pull/5373) [`5bd8db8`](https://github.com/cloudflare/workers-sdk/commit/5bd8db82a64f2c4ffab1b059b240ba6e6eaafde1) Thanks [@RamIdeas](https://github.com/RamIdeas)! - feature: Implement versioned rollbacks via `wrangler rollback [version-id] --experimental-versions`.

  Please note, the `experimental-versions` flag is required to use the new behaviour. The original `wrangler rollback` command is unchanged if run without this flag.

### Patch Changes

- [#5366](https://github.com/cloudflare/workers-sdk/pull/5366) [`e11e169`](https://github.com/cloudflare/workers-sdk/commit/e11e1691a0748c5d6520dc6c2d3d796886ea931f) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: save non-versioned script-settings (logpush, tail_consumers) on `wrangler versions deploy`. This command still requires `--experimental-versions`.

- [#5405](https://github.com/cloudflare/workers-sdk/pull/5405) [`7c701bf`](https://github.com/cloudflare/workers-sdk/commit/7c701bf75731646860be10f2515d9944c7e32361) Thanks [@RamIdeas](https://github.com/RamIdeas)! - chore: add `wrangler deployments view [deployment-id] --experimental-versions` command

  This command will display an error message which points the user to run either `wrangler deployments status --experimental-versions` or `wrangler versions view <version-id> --experimental-versions` instead.

## 3.38.0

### Minor Changes

- [#5310](https://github.com/cloudflare/workers-sdk/pull/5310) [`528c011`](https://github.com/cloudflare/workers-sdk/commit/528c011617243d1a290950e76bb88d0986a20f6a) Thanks [@penalosa](https://github.com/penalosa)! - feat: Watch the entire module root for changes in `--no-bundle` mode, rather than just the entrypoint file.

- [#5327](https://github.com/cloudflare/workers-sdk/pull/5327) [`7d160c7`](https://github.com/cloudflare/workers-sdk/commit/7d160c7fcaa8097aa3bd8b80b866ec80233be1e9) Thanks [@penalosa](https://github.com/penalosa)! - feat: Add `wrangler pages download config`

- [#5284](https://github.com/cloudflare/workers-sdk/pull/5284) [`f5e2367`](https://github.com/cloudflare/workers-sdk/commit/f5e2367288e7f57365ef8a1373bbc404bb50a662) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Add `wrangler.toml` support in `wrangler pages dev`

  As we are adding `wrangler.toml` support for Pages, we want to ensure that `wrangler pages dev` works with a configuration file.

- [#5353](https://github.com/cloudflare/workers-sdk/pull/5353) [`3be826f`](https://github.com/cloudflare/workers-sdk/commit/3be826f8411ef8d517d572f25a6be38cb8c12cc1) Thanks [@penalosa](https://github.com/penalosa)! - feat: Updates `wrangler pages functions build` to support using configuration from `wrangler.toml` in the generated output.

- [#5102](https://github.com/cloudflare/workers-sdk/pull/5102) [`ba52208`](https://github.com/cloudflare/workers-sdk/commit/ba52208147307608a1233157423e5887203e4547) Thanks [@pmiguel](https://github.com/pmiguel)! - feature: add support for queue delivery controls on `wrangler queues create`

### Patch Changes

- [#5327](https://github.com/cloudflare/workers-sdk/pull/5327) [`7d160c7`](https://github.com/cloudflare/workers-sdk/commit/7d160c7fcaa8097aa3bd8b80b866ec80233be1e9) Thanks [@penalosa](https://github.com/penalosa)! - fix: Use specific error code to signal a wrangler.toml file not being found in build-env

- [#5310](https://github.com/cloudflare/workers-sdk/pull/5310) [`528c011`](https://github.com/cloudflare/workers-sdk/commit/528c011617243d1a290950e76bb88d0986a20f6a) Thanks [@penalosa](https://github.com/penalosa)! - fix: Reload Python workers when the `requirements.txt` file changes

## 3.37.0

### Minor Changes

- [#5294](https://github.com/cloudflare/workers-sdk/pull/5294) [`bdc121d`](https://github.com/cloudflare/workers-sdk/commit/bdc121de0a05aaa4716269e2a96b3c4ae3385d8e) Thanks [@mattdeboard](https://github.com/mattdeboard)! - feature: Add `event-notification` commands in support of event notifications for Cloudflare R2.

  Included are commands for creating and deleting event notification configurations for individual buckets.

- [#5231](https://github.com/cloudflare/workers-sdk/pull/5231) [`e88ad44`](https://github.com/cloudflare/workers-sdk/commit/e88ad444f2dc54bbf4af4ac8d054ab6cd1af6898) Thanks [@w-kuhn](https://github.com/w-kuhn)! - feature: Add support for configuring HTTP Pull consumers for Queues

  HTTP Pull consumers can be used to pull messages from queues via https request.

### Patch Changes

- [#5317](https://github.com/cloudflare/workers-sdk/pull/5317) [`9fd7eba`](https://github.com/cloudflare/workers-sdk/commit/9fd7eba3f2b526530b6934a613174541ba321eca) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Deprecate `-- <command>`, `--proxy` and `--script-path` options from `wrangler pages dev`.

  Build your application to a directory and run the `wrangler pages dev <directory>` instead. This results in a more faithful emulation of production behavior.

- Updated dependencies [[`248a318`](https://github.com/cloudflare/workers-sdk/commit/248a318acac293615327affe35b83018a48dddc9)]:
  - miniflare@3.20240320.0

## 3.36.0

### Minor Changes

- [#5234](https://github.com/cloudflare/workers-sdk/pull/5234) [`e739b7f`](https://github.com/cloudflare/workers-sdk/commit/e739b7fecfb6f3f99a50091be4b7bcd44fdbaa71) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Implement environment inheritance for Pages configuration

  For Pages, Wrangler will not require both of the supported named environments ("preview" | "production") to be explicitly defined in the config file. If either `[env.production]` or `[env.preview]` is left unspecified, Wrangler will use the top-level environment when targeting that named Pages environment.

### Patch Changes

- [#5306](https://github.com/cloudflare/workers-sdk/pull/5306) [`c60fed0`](https://github.com/cloudflare/workers-sdk/commit/c60fed09f3ba3260f182f9d2e6c7c6d0bb123eac) Thanks [@taylorlee](https://github.com/taylorlee)! - fix: Remove triggered_by annotation from experimental `versions deploy` command which is now set by the API and cannot be set by the client.

- [#5321](https://github.com/cloudflare/workers-sdk/pull/5321) [`ac93411`](https://github.com/cloudflare/workers-sdk/commit/ac93411fdb124a784736db704d40592cde227535) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: rename `--experimental-gradual-rollouts` to `--experimental-versions` flag

  The `--experimental-gradual-rollouts` flag has been made an alias and will still work.

  And additional shorthand alias `--x-versions` has also been added and will work too.

- [#5324](https://github.com/cloudflare/workers-sdk/pull/5324) [`bfc4282`](https://github.com/cloudflare/workers-sdk/commit/bfc4282de58066d5a9ab07d3e8419ed12b927a96) Thanks [@penalosa](https://github.com/penalosa)! - fix: Ignore OPTIONS requests in Wrangler's oauth server

  In Chrome v123, the auth requests from the browser back to wrangler now first include a CORS OPTIONS preflight request before the expected GET request. Wrangler was able to successfully complete the login with the first (OPTIONS) request, and therefore upon the second (GET) request, errored because the token exchange had already occured and could not be repeated.

  Wrangler now stops processing the OPTIONS request before completing the token exchange and only proceeds on the expected GET request.

  If you see a `ErrorInvalidGrant` in a previous wrangler version when running `wrangler login`, please try upgrading to this version or later.

- [#5099](https://github.com/cloudflare/workers-sdk/pull/5099) [`93150aa`](https://github.com/cloudflare/workers-sdk/commit/93150aa0ee51dc3db0c15b6a7126fca11bc2ba0f) Thanks [@KaiSpencer](https://github.com/KaiSpencer)! - feat: expose `--show-interactive-dev-session` flag

  This flag controls the interactive mode of the dev session, a feature that already exists internally but was not exposed to the user.
  This is useful for CI/CD environments where the interactive mode is not desired, or running in tools like `turbo` and `nx`.

## 3.35.0

### Minor Changes

- [#5166](https://github.com/cloudflare/workers-sdk/pull/5166) [`133a190`](https://github.com/cloudflare/workers-sdk/commit/133a1907087741a4ea3cda7f53ce93919168e8f8) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Implement config file validation for Pages projects

  Wrangler proper has a mechanism in place through which it validates a wrangler.toml file for Workers projects. As part of adding wrangler toml support for Pages, we need to put a similar mechanism in place, to validate a configuration file against Pages specific requirements.

- [#5279](https://github.com/cloudflare/workers-sdk/pull/5279) [`0a86050`](https://github.com/cloudflare/workers-sdk/commit/0a860507e49329d0e140de47830d670397e08c13) Thanks [@penalosa](https://github.com/penalosa)! - feat: Support the hidden command `wrangler pages functions build-env`

- [#5093](https://github.com/cloudflare/workers-sdk/pull/5093) [`a676f55`](https://github.com/cloudflare/workers-sdk/commit/a676f55a457a8b34b1c80f666f615eb258ad58c4) Thanks [@benycodes](https://github.com/benycodes)! - feature: add --dispatch-namespace to wrangler deploy to support uploading Workers directly to a Workers for Platforms dispatch namespace.

### Patch Changes

- [#5275](https://github.com/cloudflare/workers-sdk/pull/5275) [`e1f2576`](https://github.com/cloudflare/workers-sdk/commit/e1f2576e1511a53786cebcde12d8c2cf4b3ce566) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure tail exits when the WebSocket disconnects

  Previously when the tail WebSocket disconnected, e.g. because of an Internet failure,
  the `wrangler tail` command would just hang and neither exit nor any longer receive tail messages.

  Now the process exits with an exit code of 1, and outputs an error message.

  The error message is formatted appropriately, if the tail format is set to `json`.

  Fixes #3927

- [#5069](https://github.com/cloudflare/workers-sdk/pull/5069) [`8f79981`](https://github.com/cloudflare/workers-sdk/commit/8f799812a3de1c93fb4dcb7a2a89e60c2c0173cd) Thanks [@RamIdeas](https://github.com/RamIdeas)! - chore: deprecate `wrangler version` command

  `wrangler version` is an undocumented alias for `wrangler --version`. It is being deprecated in favour of the more conventional flag syntax to avoid confusion with a new (upcoming) `wrangler versions` command.

- Updated dependencies [[`1720f0a`](https://github.com/cloudflare/workers-sdk/commit/1720f0a12a6376093b3c5799d74f47c522ae8571)]:
  - miniflare@3.20240314.0

## 3.34.2

### Patch Changes

- [#5238](https://github.com/cloudflare/workers-sdk/pull/5238) [`a0768bc`](https://github.com/cloudflare/workers-sdk/commit/a0768bcc9d76be8a88fe3e1aa45f3b3805da3df6) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: `versions upload` annotations (`--message` and/or `--tag`) are now applied correctly to the uploaded Worker Version

## 3.34.1

### Patch Changes

- Updated dependencies [[`2e50d51`](https://github.com/cloudflare/workers-sdk/commit/2e50d51632dfe905bd32de8176231bb256c88dab)]:
  - miniflare@3.20240304.2

## 3.34.0

### Minor Changes

- [#5224](https://github.com/cloudflare/workers-sdk/pull/5224) [`03484c2`](https://github.com/cloudflare/workers-sdk/commit/03484c2d64f42a2820feeec9076dc3f210baf4f9) Thanks [@RamIdeas](https://github.com/RamIdeas)! - feature: Implement `wrangler deployments list` and `wrangler deployments status` behind `--experimental-gradual-rollouts` flag.

- [#5115](https://github.com/cloudflare/workers-sdk/pull/5115) [`29e8151`](https://github.com/cloudflare/workers-sdk/commit/29e8151bc2235bd13074584df5f90187955123d2) Thanks [@RamIdeas](https://github.com/RamIdeas)! - feature: Implement `wrangler versions deploy` command.

  For now, invocations should use the `--experimental-gradual-rollouts` flag.

  Without args, a user will be guided through prompts. If args are specified, they are used as the default values for the prompts. If the `--yes` flag is specified, the defaults are automatically accepted for a non-interactive flow.

- [#5208](https://github.com/cloudflare/workers-sdk/pull/5208) [`4730b6c`](https://github.com/cloudflare/workers-sdk/commit/4730b6c087080d79838d3fd86480d8aff693834a) Thanks [@RamIdeas](https://github.com/RamIdeas)! - feature: Implement `wrangler versions list` and `wrangler versions view` commands behind the `--experimental-gradual-rollouts` flag.

- [#5064](https://github.com/cloudflare/workers-sdk/pull/5064) [`bd935cf`](https://github.com/cloudflare/workers-sdk/commit/bd935cfdf1bebfff53b1817d475b1d36eccec9c0) Thanks [@OilyLime](https://github.com/OilyLime)! - feature: Improve create and update logic for hyperdrive to include caching settings

## 3.33.0

### Minor Changes

- [#4930](https://github.com/cloudflare/workers-sdk/pull/4930) [`2680462`](https://github.com/cloudflare/workers-sdk/commit/268046269394e27654550ad034d286aa0e6aaf4b) Thanks [@rozenmd](https://github.com/rozenmd)! - refactor: default `wrangler d1 execute` and `wrangler d1 migrations` commands to local mode first, to match `wrangler dev`

  This PR defaults `wrangler d1 execute` and `wrangler d1 migrations` commands to use the local development environment provided by wrangler to match the default behaviour in `wrangler dev`.

  BREAKING CHANGE (for a beta feature): `wrangler d1 execute` and `wrangler d1 migrations` commands now default `--local` to `true`. When running `wrangler d1 execute` against a remote D1 database, you will need to provide the `--remote` flag.

### Patch Changes

- [#5184](https://github.com/cloudflare/workers-sdk/pull/5184) [`046930e`](https://github.com/cloudflare/workers-sdk/commit/046930eb898db6d45a6b26751dede07793435d28) Thanks [@nora-soderlund](https://github.com/nora-soderlund)! - fix: change d1 migrations create to use the highest migration number rather than the first non-existing migration number to allow for gaps in the migration files.

- Updated dependencies [[`1235d48`](https://github.com/cloudflare/workers-sdk/commit/1235d48fed9f4e348011fd62fce6458006947501), [`27fb22b`](https://github.com/cloudflare/workers-sdk/commit/27fb22b7c6b224aecc852915d9fee600d9d86efc)]:
  - miniflare@3.20240304.1

## 3.32.0

### Minor Changes

- [#5148](https://github.com/cloudflare/workers-sdk/pull/5148) [`11951f3`](https://github.com/cloudflare/workers-sdk/commit/11951f344ccac340be5d059bc4dd28ef674fb36f) Thanks [@dom96](https://github.com/dom96)! - chore: bump `workerd` to [`1.20240304.0`](https://github.com/cloudflare/workerd/releases/tag/v1.20240304.0)

- [#5148](https://github.com/cloudflare/workers-sdk/pull/5148) [`11951f3`](https://github.com/cloudflare/workers-sdk/commit/11951f344ccac340be5d059bc4dd28ef674fb36f) Thanks [@dom96](https://github.com/dom96)! - fix: use python_workers compat flag for Python

### Patch Changes

- [#5089](https://github.com/cloudflare/workers-sdk/pull/5089) [`5b85dc9`](https://github.com/cloudflare/workers-sdk/commit/5b85dc949b1f7c8d5e8d083b37dd84d38c4ea978) Thanks [@DaniFoldi](https://github.com/DaniFoldi)! - fix: include all currently existing bindings in `wrangler types`

  Add support for Email Send, Vectorize, Hyperdrive, mTLS, Browser Rendering and Workers AI bindings in `wrangler types`

  For example, from the following `wrangler.toml` setup:

  ```toml
  [browser]
  binding = "BROWSER"

  [ai]
  binding = "AI"

  [[send_email]]
  name = "SEND_EMAIL"

  [[vectorize]]
  binding = "VECTORIZE"
  index_name = "VECTORIZE_NAME"

  [[hyperdrive]]
  binding = "HYPERDRIVE"
  id = "HYPERDRIVE_ID"

  [[mtls_certificates]]
  binding = "MTLS"
  certificate_id = "MTLS_CERTIFICATE_ID"
  ```

  Previously, nothing would have been included in the generated Environment.
  Now, the following will be generated:

  ```ts
  interface Env {
  	SEND_EMAIL: SendEmail;
  	VECTORIZE: VectorizeIndex;
  	HYPERDRIVE: Hyperdrive;
  	MTLS: Fetcher;
  	BROWSER: Fetcher;
  	AI: Fetcher;
  }
  ```

- Updated dependencies [[`11951f3`](https://github.com/cloudflare/workers-sdk/commit/11951f344ccac340be5d059bc4dd28ef674fb36f), [`11951f3`](https://github.com/cloudflare/workers-sdk/commit/11951f344ccac340be5d059bc4dd28ef674fb36f)]:
  - miniflare@3.20240304.0

## 3.31.0

### Minor Changes

- [#5119](https://github.com/cloudflare/workers-sdk/pull/5119) [`b0bd413`](https://github.com/cloudflare/workers-sdk/commit/b0bd4137f8504c1a96c5fa60f25c41028c9ba23e) Thanks [@garrettgu10](https://github.com/garrettgu10)! - feature: Python support for remote dev

- [#5118](https://github.com/cloudflare/workers-sdk/pull/5118) [`30694a3`](https://github.com/cloudflare/workers-sdk/commit/30694a31d65016e56e30d14a3b14f2fed6df4370) Thanks [@garrettgu10](https://github.com/garrettgu10)! - fix: Including version identifiers in Python requirements.txt will now throw an error

### Patch Changes

- [#5132](https://github.com/cloudflare/workers-sdk/pull/5132) [`82a3f94`](https://github.com/cloudflare/workers-sdk/commit/82a3f94db091c893b5dfc9496aad6154a54474c5) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: switch default logging level of `unstable_dev()` to `warn`

  When running `unstable_dev()` in its default "test mode", the logging level was set to `none`. This meant any Worker startup errors or helpful warnings wouldn't be shown. This change switches the default to `warn`. To restore the previous behaviour, include `logLevel: "none"` in your options object:

  ```js
  const worker = await unstable_dev("path/to/script.js", {
  	logLevel: "none",
  });
  ```

- [#5128](https://github.com/cloudflare/workers-sdk/pull/5128) [`d27e2a7`](https://github.com/cloudflare/workers-sdk/commit/d27e2a70904aab98b4e5c7279661a8d98e7da917) Thanks [@taylorlee](https://github.com/taylorlee)! - fix: Add legacy_env support to experimental versions upload command.

- [#5087](https://github.com/cloudflare/workers-sdk/pull/5087) [`a5231de`](https://github.com/cloudflare/workers-sdk/commit/a5231decbf18898811749a64f8e36be4aa5fd941) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make `wrangler types` always generate a `d.ts` file for module workers

  Currently if a config file doesn't define any binding nor module, running
  `wrangler types` against such file would not produce a `d.ts` file.

  Producing a `d.ts` file can however still be beneficial as it would define a correct
  env interface (even if empty) that can be expanded/referenced by user code (this can
  be particularly convenient for scaffolding tools that may want to always generate an
  env interface).

  Example:
  Before `wrangler types --env-interface MyEnv` run with an empty `wrangler.toml` file
  would not generate any file, after these change it would instead generate a file with
  the following content:

  ```
  interface MyEnv {
  }
  ```

- [#5138](https://github.com/cloudflare/workers-sdk/pull/5138) [`3dd9089`](https://github.com/cloudflare/workers-sdk/commit/3dd9089f34d30dcd6f03e63093e86efa9b8c1e1f) Thanks [@G4brym](https://github.com/G4brym)! - fix: ensure Workers-AI local mode fetcher returns headers to client worker

- Updated dependencies [[`42bcc72`](https://github.com/cloudflare/workers-sdk/commit/42bcc7216ab14455c1398d55bc552023726eb423), [`42bcc72`](https://github.com/cloudflare/workers-sdk/commit/42bcc7216ab14455c1398d55bc552023726eb423)]:
  - miniflare@3.20240223.1

## 3.30.1

### Patch Changes

- [#5106](https://github.com/cloudflare/workers-sdk/pull/5106) [`2ed7f32`](https://github.com/cloudflare/workers-sdk/commit/2ed7f3209bc6bffa85f409d344d6ed76df8686f9) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: automatically drain incoming request bodies

  Previously, requests sent to `wrangler dev` with unconsumed bodies could result in `Network connection lost` errors. This change attempts to work around the issue by ensuring incoming request bodies are drained if they're not used. This is a temporary fix whilst we try to address the underlying issue. Whilst we don't think this change will introduce any other issues, it can be disabled by setting the `WRANGLER_DISABLE_REQUEST_BODY_DRAINING=true` environment variable. Note this fix is only applied if you've enabled Wrangler's bundling—`--no-bundle` mode continues to have the previous behaviour.

- [#5107](https://github.com/cloudflare/workers-sdk/pull/5107) [`65d0399`](https://github.com/cloudflare/workers-sdk/commit/65d0399c0757881c41582972d14afa02f02fffb4) Thanks [@penalosa](https://github.com/penalosa)! - fix: Ensures that switching to remote mode during a dev session (from local mode) will correctly use the right zone. Previously, zone detection happened before the dev session was mounted, and so dev sessions started with local mode would have no zone inferred, and would have failed to start, with an ugly error.

- [#5107](https://github.com/cloudflare/workers-sdk/pull/5107) [`65d0399`](https://github.com/cloudflare/workers-sdk/commit/65d0399c0757881c41582972d14afa02f02fffb4) Thanks [@penalosa](https://github.com/penalosa)! - fix: Ensure that preview sessions created without a zone don't switch the host on which to start the preview from the one returned by the API.

- [#4833](https://github.com/cloudflare/workers-sdk/pull/4833) [`54f6bfc`](https://github.com/cloudflare/workers-sdk/commit/54f6bfcea14b89cae99f3c26b52c28bcd408aba7) Thanks [@admah](https://github.com/admah)! - fix: remove extra arguments from wrangler init deprecation message and update recommended c3 version

  c3 can now infer the pre-existing type from the presence of the `--existing-script` flag so we can remove the extra `type` argument. C3 2.5.0 introduces an auto-update feature that will make sure users get the latest minor version of c3 and prevent problems where older 2.x.x versions get cached by previous runs of `wrangler init`.

## 3.30.0

### Minor Changes

- [#4742](https://github.com/cloudflare/workers-sdk/pull/4742) [`c2f3f1e`](https://github.com/cloudflare/workers-sdk/commit/c2f3f1e37c1a8f0958676306f3128cd87265ea5b) Thanks [@benycodes](https://github.com/benycodes)! - feat: allow preserving file names when defining rules for non-js modules

  The developer is now able to specify the `preserve_file_names property in wrangler.toml
  which specifies whether Wrangler will preserve the file names additional modules that are
  added to the deployment bundle of a Worker.

  If not set to true, files will be named using the pattern ${fileHash}-${basename}.
  For example, `34de60b44167af5c5a709e62a4e20c4f18c9e3b6-favicon.ico`.

  Resolves [#4741](https://github.com/cloudflare/workers-sdk/issues/4741)

### Patch Changes

- Updated dependencies [[`0c0949d`](https://github.com/cloudflare/workers-sdk/commit/0c0949da60e3287c05a5884bb9f869ce5609a9a1)]:
  - miniflare@3.20240223.0

## 3.29.0

### Minor Changes

- [#5042](https://github.com/cloudflare/workers-sdk/pull/5042) [`5693d076`](https://github.com/cloudflare/workers-sdk/commit/5693d076e2aab99d4736649d5b467689ce25cb23) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - feat: add new `--env-interface` to `wrangler types`

  Allow users to specify the name of the interface that they want `wrangler types` to generate for the `env` parameter, via the new CLI flag `--env-interface`

  Example:

  ```sh
  wrangler types --env-interface CloudflareEnv
  ```

  generates

  ```ts
  interface CloudflareEnv {}
  ```

  instead of

  ```ts
  interface Env {}
  ```

* [#5042](https://github.com/cloudflare/workers-sdk/pull/5042) [`5693d076`](https://github.com/cloudflare/workers-sdk/commit/5693d076e2aab99d4736649d5b467689ce25cb23) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - feat: add new `path` positional argument to `wrangler types`

  Allow users to specify the path to the typings (.d.ts) file they want
  `wrangler types` to generate

  Example:

  ```sh
  wrangler types ./my-env.d.ts
  ```

  generates a `my-env.d.ts` file in the current directory
  instead of creating a `worker-configuration.d.ts` file

### Patch Changes

- [#5042](https://github.com/cloudflare/workers-sdk/pull/5042) [`5693d076`](https://github.com/cloudflare/workers-sdk/commit/5693d076e2aab99d4736649d5b467689ce25cb23) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - feat: include command run in the `wrangler types` comment

  In the comment added to the `.d.ts` file generated by `wrangler types`
  include the command run to generated the file

* [#4303](https://github.com/cloudflare/workers-sdk/pull/4303) [`1c460287`](https://github.com/cloudflare/workers-sdk/commit/1c460287f8836102b372ce0c7dddec093259692e) Thanks [@richardscarrott](https://github.com/richardscarrott)! - fix: allow Pages Functions to import built-in node:\* modules, even when not bundling with wrangler

- [#4957](https://github.com/cloudflare/workers-sdk/pull/4957) [`50f93bd2`](https://github.com/cloudflare/workers-sdk/commit/50f93bd2ce8f14294bee73b844897c5bfa083955) Thanks [@garrettgu10](https://github.com/garrettgu10)! - fix: don't strip `.py` extensions from Python modules

* [#5042](https://github.com/cloudflare/workers-sdk/pull/5042) [`5693d076`](https://github.com/cloudflare/workers-sdk/commit/5693d076e2aab99d4736649d5b467689ce25cb23) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make `wrangler types` honor top level config argument

  The `wrangler types` command currently ignores the `-c|--config` argument
  (although it is still getting shown in the command's help message). Make
  sure that the command honors the flag.
  Also, if no config file is detected
  present a warning to the user

- [#5042](https://github.com/cloudflare/workers-sdk/pull/5042) [`5693d076`](https://github.com/cloudflare/workers-sdk/commit/5693d076e2aab99d4736649d5b467689ce25cb23) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make the `wrangler types` command pick up local secret keys from `.dev.vars`

  Make sure that the `wrangler types` command correctly picks up
  secret keys defined in `.dev.vars` and includes them in the generated
  file (marking them as generic `string` types of course)

- Updated dependencies [[`b03db864`](https://github.com/cloudflare/workers-sdk/commit/b03db864a36924c31b8ddd82a027c83df4f68c43)]:
  - miniflare@3.20240208.0

## 3.28.4

### Patch Changes

- [#5050](https://github.com/cloudflare/workers-sdk/pull/5050) [`88be4b84`](https://github.com/cloudflare/workers-sdk/commit/88be4b847f8891041afcc4704e69a84d3abe6126) Thanks [@nora-soderlund](https://github.com/nora-soderlund)! - fix: allow kv:namespace create to accept a namespace name that contains characters not allowed in a binding name

  This command tries to use the namespace name as the binding. Previously, we would unnecessarily error if this namespace name did not fit the binding name constraints. Now we accept such names and then remove invalid characters when generating the binding name.

## 3.28.3

### Patch Changes

- [#5026](https://github.com/cloudflare/workers-sdk/pull/5026) [`04584722`](https://github.com/cloudflare/workers-sdk/commit/0458472251f17e864b45a167750baa50ca641e46) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make sure `getPlatformProxy` produces a production-like `caches` object

  make sure that the `caches` object returned to `getPlatformProxy` behaves
  in the same manner as the one present in production (where calling unsupported
  methods throws a helpful error message)

  note: make sure that the unsupported methods are however not included in the
  `CacheStorage` type definition

* [#5030](https://github.com/cloudflare/workers-sdk/pull/5030) [`55ea0721`](https://github.com/cloudflare/workers-sdk/commit/55ea0721b2550c8c24d79ddcc116ba5b4bc75028) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: don't suggest reporting user errors to GitHub

  Wrangler has two different types of errors: internal errors caused by something going wrong, and user errors caused by an invalid configuration. Previously, we would encourage users to submit bug reports for user errors, even though there's nothing we can do to fix them. This change ensures we only suggest this for internal errors.

- [#4900](https://github.com/cloudflare/workers-sdk/pull/4900) [`3389f2e9`](https://github.com/cloudflare/workers-sdk/commit/3389f2e9daa27f89c2dc35c2ccd4da4ec54db683) Thanks [@OilyLime](https://github.com/OilyLime)! - feature: allow hyperdrive users to set local connection string as environment variable

  Wrangler dev now supports the HYPERDRIVE_LOCAL_CONNECTION_STRING environmental variable for connecting to a local database instance when testing Hyperdrive in local development. This environmental variable takes precedence over the localConnectionString set in wrangler.toml.

* [#5033](https://github.com/cloudflare/workers-sdk/pull/5033) [`b1ace91b`](https://github.com/cloudflare/workers-sdk/commit/b1ace91bbfa9c484a931639a38e3798b1b217c89) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: wait for actual port before opening browser with `--port=0`

  Previously, running `wrangler dev --remote --port=0` and then immediately pressing `b` would open `localhost:0` in your default browser. This change queues up opening the browser until Wrangler knows the port the dev server was started on.

- [#5026](https://github.com/cloudflare/workers-sdk/pull/5026) [`04584722`](https://github.com/cloudflare/workers-sdk/commit/0458472251f17e864b45a167750baa50ca641e46) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: relax the `getPlatformProxy`'s' cache request/response types

  prior to these changes the caches obtained from `getPlatformProxy`
  would use `unknown`s as their types, this proved too restrictive
  and incompatible with the equivalent `@cloudflare/workers-types`
  types, we decided to use `any`s instead to allow for more flexibility
  whilst also making the type compatible with workers-types

- Updated dependencies [[`7723ac17`](https://github.com/cloudflare/workers-sdk/commit/7723ac17906f894afe9af2152437726ac09a6290), [`027f9719`](https://github.com/cloudflare/workers-sdk/commit/027f971975a48a564603275f3583d21e9d053229), [`027f9719`](https://github.com/cloudflare/workers-sdk/commit/027f971975a48a564603275f3583d21e9d053229), [`027f9719`](https://github.com/cloudflare/workers-sdk/commit/027f971975a48a564603275f3583d21e9d053229), [`027f9719`](https://github.com/cloudflare/workers-sdk/commit/027f971975a48a564603275f3583d21e9d053229), [`027f9719`](https://github.com/cloudflare/workers-sdk/commit/027f971975a48a564603275f3583d21e9d053229), [`027f9719`](https://github.com/cloudflare/workers-sdk/commit/027f971975a48a564603275f3583d21e9d053229)]:

  - miniflare@3.20240129.3

- [#4475](https://github.com/cloudflare/workers-sdk/pull/4475) [86d94ff](https://github.com/cloudflare/workers-sdk/commit/86d94ff5acd31eee7f02bc68e0b70f792eb3e74c) Thanks [@paulrostorp](https://github.com/paulrostorp)! - feat: support custom HTTPS certificate paths in Wrangler dev commands.

  Adds flags --https-key-path and --https-cert-path to `wrangler dev` and `wrangler pages dev` commands.

  Fixes [#2118](https://github.com/cloudflare/workers-sdk/issues/2118)

## 3.28.2

### Patch Changes

- [#4950](https://github.com/cloudflare/workers-sdk/pull/4950) [`05360e43`](https://github.com/cloudflare/workers-sdk/commit/05360e432bff922def960e86690232c762fad284) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure we do not rewrite external Origin headers in wrangler dev

  In https://github.com/cloudflare/workers-sdk/pull/4812 we tried to fix the Origin headers to match the Host header but were overzealous and rewrote Origin headers for external origins (outside of the proxy server's origin).

  This is now fixed, and moreover we rewrite any headers that refer to the proxy server on the request with the configured host and vice versa on the response.

  This should ensure that CORS is not broken in browsers when a different host is being simulated based on routes in the Wrangler configuration.

* [#4997](https://github.com/cloudflare/workers-sdk/pull/4997) [`bfeefe27`](https://github.com/cloudflare/workers-sdk/commit/bfeefe275390491a7bb71f01550b3cb368d13320) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - chore: add missing `defineNavigatorUserAgent` dependency to useEsbuild hook

- [#4966](https://github.com/cloudflare/workers-sdk/pull/4966) [`36692326`](https://github.com/cloudflare/workers-sdk/commit/366923264fe2643acee0761c849ad0dc3922ad6c) Thanks [@penalosa](https://github.com/penalosa)! - fix: Report Custom Build failures as `UserError`s

* [#5002](https://github.com/cloudflare/workers-sdk/pull/5002) [`315a651b`](https://github.com/cloudflare/workers-sdk/commit/315a651b5742a614fd950c29b5dac5fdd2d1f270) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - chore: rename `getBindingsProxy` to `getPlatformProxy`

  initially `getBindingsProxy` was supposed to only provide proxies for bindings,
  the utility has however grown, including now `cf`, `ctx` and `caches`, to
  clarify the increased scope the utility is getting renamed to `getPlatformProxy`
  and its `bindings` field is getting renamed `env`

  _note_: `getBindingProxy` with its signature is still kept available, making this
  a non breaking change

* Updated dependencies [[`05360e43`](https://github.com/cloudflare/workers-sdk/commit/05360e432bff922def960e86690232c762fad284)]:
  - miniflare@3.20240129.2

## 3.28.1

### Patch Changes

- [#4962](https://github.com/cloudflare/workers-sdk/pull/4962) [`d6585178`](https://github.com/cloudflare/workers-sdk/commit/d658517883e03ddf07672aba9e4075911f309c05) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure `wrangler dev` can reload without crashing when importing `node:*` modules

  The previous Wrangler release introduced a regression that caused reloads to fail when importing `node:*` modules. This change fixes that, and ensures these modules can always be resolved.

* [#4951](https://github.com/cloudflare/workers-sdk/pull/4951) [`ffafe8ad`](https://github.com/cloudflare/workers-sdk/commit/ffafe8ad9bf5549d6c2d92091f88bcd5373fc824) Thanks [@nora-soderlund](https://github.com/nora-soderlund)! - fix: D1 batch splitting to handle CASE as compound statement starts

## 3.28.0

### Minor Changes

- [#4499](https://github.com/cloudflare/workers-sdk/pull/4499) [`cf9c029b`](https://github.com/cloudflare/workers-sdk/commit/cf9c029b30e1db3a1c3f9dc4208b9c34021a8ac0) Thanks [@penalosa](https://github.com/penalosa)! - feat: Support runtime-agnostic polyfills

  Previously, Wrangler treated any imports of `node:*` modules as build-time errors (unless one of the two Node.js compatibility modes was enabled). This is sometimes overly aggressive, since those imports are often not hit at runtime (for instance, it was impossible to write a library that worked across Node.JS and Workers, using Node packages only when running in Node). Here's an example of a function that would cause Wrangler to fail to build:

  ```ts
  export function randomBytes(length: number) {
  	if (navigator.userAgent !== "Cloudflare-Workers") {
  		return new Uint8Array(require("node:crypto").randomBytes(length));
  	} else {
  		return crypto.getRandomValues(new Uint8Array(length));
  	}
  }
  ```

  This function _should_ work in both Workers and Node, since it gates Node-specific functionality behind a user agent check, and falls back to the built-in Workers crypto API. Instead, Wrangler detected the `node:crypto` import and failed with the following error:

  ```
  ✘ [ERROR] Could not resolve "node:crypto"

      src/randomBytes.ts:5:36:
        5 │ ... return new Uint8Array(require('node:crypto').randomBytes(length));
          ╵                                   ~~~~~~~~~~~~~

    The package "node:crypto" wasn't found on the file system but is built into node.
    Add "node_compat = true" to your wrangler.toml file to enable Node.js compatibility.
  ```

  This change turns that Wrangler build failure into a warning, which users can choose to ignore if they know the import of `node:*` APIs is safe (because it will never trigger at runtime, for instance):

  ```
  ▲ [WARNING] The package "node:crypto" wasn't found on the file system but is built into node.

    Your Worker may throw errors at runtime unless you enable the "nodejs_compat"
    compatibility flag. Refer to
    https://developers.cloudflare.com/workers/runtime-apis/nodejs/ for more details.
    Imported from:
     - src/randomBytes.ts
  ```

  However, in a lot of cases, it's possible to know at _build_ time whether the import is safe. This change also injects `navigator.userAgent` into `esbuild`'s bundle settings as a predefined constant, which means that `esbuild` can tree-shake away imports of `node:*` APIs that are guaranteed not to be hit at runtime, supressing the warning entirely.

* [#4926](https://github.com/cloudflare/workers-sdk/pull/4926) [`a14bd1d9`](https://github.com/cloudflare/workers-sdk/commit/a14bd1d97c5180b1fd48c2a0907424cf81d67bdb) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - feature: add a `cf` field to the `getBindingsProxy` result

  Add a new `cf` field to the `getBindingsProxy` result that people can use to mock the production
  `cf` (`IncomingRequestCfProperties`) object.

  Example:

  ```ts
  const { cf } = await getBindingsProxy();

  console.log(`country = ${cf.country}; colo = ${cf.colo}`);
  ```

### Patch Changes

- [#4931](https://github.com/cloudflare/workers-sdk/pull/4931) [`321c7ed7`](https://github.com/cloudflare/workers-sdk/commit/321c7ed7355f64a22b0d26b2f097ba2e06e4b5e8) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make the entrypoint optional for the `types` command

  Currently running `wrangler types` against a `wrangler.toml` file without a defined entrypoint (`main` value)
  causes the command to error with the following message:

  ```
  ✘ [ERROR] Missing entry-point: The entry-point should be specified via the command line (e.g. `wrangler types path/to/script`) or the `main` config field.
  ```

  However developers could want to generate types without the entrypoint being defined (for example when using `getBindingsProxy`), so these changes
  make the entrypoint optional for the `types` command, assuming modules syntax if none is specified.

* [#4867](https://github.com/cloudflare/workers-sdk/pull/4867) [`d637bd59`](https://github.com/cloudflare/workers-sdk/commit/d637bd59a8ea6612d59ed4b73e115287615e617d) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: inflight requests to UserWorker which failed across reloads are now retried

  Previously, when running `wrangler dev`, requests inflight during a UserWorker reload (due to config or source file changes) would fail.

  Now, if those inflight requests are GET or HEAD requests, they will be reproxied against the new UserWorker. This adds to the guarantee that requests made during local development reach the latest worker.

- [#4928](https://github.com/cloudflare/workers-sdk/pull/4928) [`4a735c46`](https://github.com/cloudflare/workers-sdk/commit/4a735c46fdf5752f141e0e646624f44ad6301ced) Thanks [@sdnts](https://github.com/sdnts)! - fix: Update API calls for Sippy's endpoints

* [#4938](https://github.com/cloudflare/workers-sdk/pull/4938) [`75bd08ae`](https://github.com/cloudflare/workers-sdk/commit/75bd08aed0b82268fb5cf0f42cdd85d4d6d235ef) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: print wrangler banner at the start of every d1 command

  This PR adds a wrangler banner to the start of every D1 command (except when invoked in JSON-mode)

  For example:

  ```
   ⛅️ wrangler 3.27.0
  -------------------
  ...
  ```

- [#4953](https://github.com/cloudflare/workers-sdk/pull/4953) [`d96bc7dd`](https://github.com/cloudflare/workers-sdk/commit/d96bc7dd803739f1815601d707d9b6e6062436da) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: allow `port` option to be specified with `unstable_dev()`

  Previously, specifying a non-zero `port` when using `unstable_dev()` would try to start two servers on that `port`. This change ensures we only start the user-facing server on the specified `port`, allow `unstable_dev()` to startup correctly.

## 3.27.0

### Minor Changes

- [#4877](https://github.com/cloudflare/workers-sdk/pull/4877) [`3e7cd6e4`](https://github.com/cloudflare/workers-sdk/commit/3e7cd6e40816c5c6ab28163508a6ba9729c6de73) Thanks [@magnusdahlstrand](https://github.com/magnusdahlstrand)! - fix: Do not show unnecessary errors during watch rebuilds

  When Pages is used in conjunction with a full stack framework, the framework
  build will temporarily remove files that are being watched by Pages, such as
  `_worker.js` and `_routes.json`.
  Previously we would display errors for these changes, which adds confusing and excessive messages to the Pages dev output. Now builds are skipped if a watched `_worker.js` or `_routes.json` is removed.

* [#4901](https://github.com/cloudflare/workers-sdk/pull/4901) [`2469e9fa`](https://github.com/cloudflare/workers-sdk/commit/2469e9faeaaa86d70bc7e3714c515274b38a67de) Thanks [@penalosa](https://github.com/penalosa)! - feature: implemented Python support in Wrangler

  Python Workers are now supported by `wrangler deploy` and `wrangler dev`.

- [#4922](https://github.com/cloudflare/workers-sdk/pull/4922) [`4c7031a6`](https://github.com/cloudflare/workers-sdk/commit/4c7031a6b2ed33e38147d95922d6b15b0ad851ec) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - feature: add a `ctx` field to the `getBindingsProxy` result

  Add a new `ctx` filed to the `getBindingsProxy` result that people can use to mock the production
  `ExecutionContext` object.

  Example:

  ```ts
  const { ctx } = await getBindingsProxy();
  ctx.waitUntil(myPromise);
  ```

### Patch Changes

- [#4914](https://github.com/cloudflare/workers-sdk/pull/4914) [`e61dba50`](https://github.com/cloudflare/workers-sdk/commit/e61dba503598b38d9daabe63ab71f75def1e7856) Thanks [@nora-soderlund](https://github.com/nora-soderlund)! - fix: ensure d1 validation errors render user friendly messages

* [#4907](https://github.com/cloudflare/workers-sdk/pull/4907) [`583e4451`](https://github.com/cloudflare/workers-sdk/commit/583e4451c99d916bde52e766b8a19765584303d1) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: mark R2 object and bucket not found errors as unreportable

  Previously, running `wrangler r2 objects {get,put}` with an object or bucket that didn't exist would ask if you wanted to report that error to Cloudflare. There's nothing we can do to fix this, so this change prevents the prompt in this case.

- [#4872](https://github.com/cloudflare/workers-sdk/pull/4872) [`5ef56067`](https://github.com/cloudflare/workers-sdk/commit/5ef56067ccf8e20b34fe87455da8b798702181f1) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: intercept and stringify errors thrown by d1 execute in --json mode

  Prior to this PR, if a query threw an error when run in `wrangler d1 execute ... --json`, wrangler would swallow the error.

  This PR returns the error as JSON. For example, the invalid query `SELECT asdf;` now returns the following in JSON mode:

  ```json
  {
  	"error": {
  		"text": "A request to the Cloudflare API (/accounts/xxxx/d1/database/xxxxxxx/query) failed.",
  		"notes": [
  			{
  				"text": "no such column: asdf at offset 7 [code: 7500]"
  			}
  		],
  		"kind": "error",
  		"name": "APIError",
  		"code": 7500
  	}
  }
  ```

* [#4888](https://github.com/cloudflare/workers-sdk/pull/4888) [`3679bc18`](https://github.com/cloudflare/workers-sdk/commit/3679bc18b2cb849fd4023ac653c06e0a7ec2195f) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure that the Pages dev proxy server does not change the Host header

  Previously, when configuring `wrangler pages dev` to use a proxy to a 3rd party dev server,
  the proxy would replace the Host header, resulting in problems at the dev server if it was
  checking for cross-site scripting attacks.

  Now the proxy server passes through the Host header unaltered making it invisible to the
  3rd party dev server.

  Fixes #4799

- [#4909](https://github.com/cloudflare/workers-sdk/pull/4909) [`34b6ea1e`](https://github.com/cloudflare/workers-sdk/commit/34b6ea1ea59884daca0c0d09265feacc10a4a685) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: add an experimental `insights` command to `wrangler d1`

  This PR adds a `wrangler d1 insights <DB_NAME>` command, to let D1 users figure out which of their queries to D1 need to be optimised.

  This command defaults to fetching the top 5 queries that took the longest to run in total over the last 24 hours.

  You can also fetch the top 5 queries that consumed the most rows read over the last week, for example:

  ```bash
  npx wrangler d1 insights northwind --sortBy reads --timePeriod 7d
  ```

  Or the top 5 queries that consumed the most rows written over the last month, for example:

  ```bash
  npx wrangler d1 insights northwind --sortBy writes --timePeriod 31d
  ```

  Or the top 5 most frequently run queries in the last 24 hours, for example:

  ```bash
  npx wrangler d1 insights northwind --sortBy count
  ```

* [#4830](https://github.com/cloudflare/workers-sdk/pull/4830) [`48f90859`](https://github.com/cloudflare/workers-sdk/commit/48f9085981f0a4923d3ccc32596520107c4e4df8) Thanks [@Lekensteyn](https://github.com/Lekensteyn)! - fix: listen on loopback for wrangler dev port check and login

  Avoid listening on the wildcard address by default to reduce the attacker's
  surface and avoid firewall prompts on macOS.

  Relates to #4430.

- [#4907](https://github.com/cloudflare/workers-sdk/pull/4907) [`583e4451`](https://github.com/cloudflare/workers-sdk/commit/583e4451c99d916bde52e766b8a19765584303d1) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure `wrangler dev --log-level` flag applied to all logs

  Previously, `wrangler dev` may have ignored the `--log-level` flag for some startup logs. This change ensures the `--log-level` flag is applied immediately.

- Updated dependencies [[`148feff6`](https://github.com/cloudflare/workers-sdk/commit/148feff60c9bf3886c0e0fd1ea98049955c27659)]:
  - miniflare@3.20240129.1

## 3.26.0

### Minor Changes

- [#4847](https://github.com/cloudflare/workers-sdk/pull/4847) [`6968e11f`](https://github.com/cloudflare/workers-sdk/commit/6968e11f3c1f4911c666501ca9654eabfe87244b) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - feature: expose new (no-op) `caches` field in `getBindingsProxy` result

  Add a new `caches` field to the `getBindingsProxy` result, such field implements a
  no operation (no-op) implementation of the runtime `caches`

  Note: Miniflare exposes a proper `caches` mock, we will want to use that one in
  the future but issues regarding it must be ironed out first, so for the
  time being a no-op will have to do

### Patch Changes

- [#4860](https://github.com/cloudflare/workers-sdk/pull/4860) [`b92e5ac0`](https://github.com/cloudflare/workers-sdk/commit/b92e5ac006195d490bcf9be3b547ba0bfa33f151) Thanks [@Sibirius](https://github.com/Sibirius)! - fix: allow empty strings in secret:bulk upload

  Previously, the `secret:bulk` command would fail if any of the secrets in the secret.json file were empty strings and they already existed remotely.

* [#4869](https://github.com/cloudflare/workers-sdk/pull/4869) [`fd084bc0`](https://github.com/cloudflare/workers-sdk/commit/fd084bc0c890458f479e756b616ed023b7142bba) Thanks [@jculvey](https://github.com/jculvey)! - feature: Expose AI bindings to `getBindingsProxy`.

  The `getBindingsProxy` utility function will now contain entries for any AI bindings specified in `wrangler.toml`.

- [#4880](https://github.com/cloudflare/workers-sdk/pull/4880) [`65da40a1`](https://github.com/cloudflare/workers-sdk/commit/65da40a1229c4e5358553f2636282eb909ebc662) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: do not attempt login during dry-run

  The "standard pricing" warning was attempting to make an API call that was causing a login attempt even when on a dry-run.
  Now this warning is disabled during dry-runs.

  Fixes #4723

* [#4819](https://github.com/cloudflare/workers-sdk/pull/4819) [`6a4cb8c6`](https://github.com/cloudflare/workers-sdk/commit/6a4cb8c6456f1dba95cae2b8bbe658f7227349f8) Thanks [@magnusdahlstrand](https://github.com/magnusdahlstrand)! - fix: Use appropriate logging levels when parsing headers and redirects in `wrangler pages dev`.

* Updated dependencies [[`1e424ff2`](https://github.com/cloudflare/workers-sdk/commit/1e424ff280610657e997df8290d0b39b0393c845), [`749fa3c0`](https://github.com/cloudflare/workers-sdk/commit/749fa3c05e6b9fcaa59a72f60f7936b7beaed5ad)]:
  - miniflare@3.20240129.0

## 3.25.0

### Minor Changes

- [#4815](https://github.com/cloudflare/workers-sdk/pull/4815) [`030360d6`](https://github.com/cloudflare/workers-sdk/commit/030360d6572ec9ec09f8bb9dfe6ec7ce198e394b) Thanks [@jonesphillip](https://github.com/jonesphillip)! - feature: adds support for configuring Sippy with Google Cloud Storage (GCS) provider.

  Sippy (https://developers.cloudflare.com/r2/data-migration/sippy/) now supports Google Cloud Storage.
  This change updates the `wrangler r2 sippy` commands to take a provider (AWS or GCS) and appropriate configuration arguments.
  If you don't specify `--provider` argument then the command will enter an interactive flow for the user to set the configuration.
  Note that this is a breaking change from the previous behaviour where you could configure AWS as the provider without explictly specifying the `--provider` argument.
  (This breaking change is allowed in a minor release because the Sippy feature and `wrangler r2 sippy` commands are marked as beta.)

### Patch Changes

- [#4841](https://github.com/cloudflare/workers-sdk/pull/4841) [`10396125`](https://github.com/cloudflare/workers-sdk/commit/103961250f959a69f5c5137ad27196558ab7e549) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: replace D1's dashed time-travel endpoints with underscored ones

  D1 will maintain its `d1/database/${databaseId}/time-travel/*` endpoints until GA, at which point older versions of wrangler will start throwing errors to users, asking them to upgrade their wrangler version to continue using Time Travel via CLI.

* [#4656](https://github.com/cloudflare/workers-sdk/pull/4656) [`77b0bce3`](https://github.com/cloudflare/workers-sdk/commit/77b0bce3d9a4ca6c2246547d1c30757f2a97e01f) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure upstream_protocol is passed to the Worker

  In `wrangler dev` it is possible to set the `upstream_protocol`,
  which is the protocol under which the User Worker believes it has been
  requested, as recorded in the `request.url` that can be used for
  forwarding on requests to the origin.

  Previously, it was not being passed to `wrangler dev` in local mode.
  Instead it was always set to `http`.

  Note that setting `upstream_protocol` to `http` is not supported in
  `wrangler dev` remote mode, which is the case since Wrangler v2.0.

  This setting now defaults to `https` in remote mode (since that is the only option),
  and to the same as `local_protocol` in local mode.

  Fixes #4539

- [#4810](https://github.com/cloudflare/workers-sdk/pull/4810) [`6eb2b9d1`](https://github.com/cloudflare/workers-sdk/commit/6eb2b9d10e154e64aff5ad5eafd35d44592275eb) Thanks [@gabivlj](https://github.com/gabivlj)! - fix: Cloudchamber command shows json error message on load account if --json specified

  If the user specifies a json option, we should see a more detailed error on why `loadAccount` failed.

* [#4820](https://github.com/cloudflare/workers-sdk/pull/4820) [`b01c1548`](https://github.com/cloudflare/workers-sdk/commit/b01c154889d9d10b2ccf0193f453f947479263fc) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: show up-to-date sources in DevTools when saving source files

  Previously, DevTools would never refresh source contents after opening a file, even if it was updated on-disk. This could cause issues with step-through debugging as breakpoints set in source files would map to incorrect locations in bundled Worker code. This change ensures DevTools' source cache is cleared on each reload, preventing outdated sources from being displayed.

* Updated dependencies [[`8166eefc`](https://github.com/cloudflare/workers-sdk/commit/8166eefc11ff3b5ce6ede41fe9d6224d945a2cde)]:
  - miniflare@3.20231218.4

## 3.24.0

### Minor Changes

- [#4523](https://github.com/cloudflare/workers-sdk/pull/4523) [`9f96f28b`](https://github.com/cloudflare/workers-sdk/commit/9f96f28b88252dc62f1901f6533a69218f96c2dd) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Add new `getBindingsProxy` utility to the wrangler package

  The new utility is part of wrangler's JS API (it is not part of the wrangler CLI) and its use is to provide proxy objects to bindings, such objects can be used in Node.js code as if they were actual bindings

  The utility reads the `wrangler.toml` file present in the current working directory in order to discern what bindings should be available (a `wrangler.json` file can be used too, as well as config files with custom paths).

  ## Example

  Assuming that in the current working directory there is a `wrangler.toml` file with the following
  content:

  ```
  [[kv_namespaces]]
  binding = "MY_KV"
  id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  ```

  The utility could be used in a nodejs script in the following way:

  ```js
  import { getBindingsProxy } from "wrangler";

  const { bindings, dispose } = await getBindingsProxy();

  try {
  	const myKv = bindings.MY_KV;
  	const kvValue = await myKv.get("my-kv-key");

  	console.log(`KV Value = ${kvValue}`);
  } finally {
  	await dispose();
  }
  ```

### Patch Changes

- [#3427](https://github.com/cloudflare/workers-sdk/pull/3427) [`b79e93a3`](https://github.com/cloudflare/workers-sdk/commit/b79e93a37c4231e2406efde3b1ff390481828a18) Thanks [@ZakKemble](https://github.com/ZakKemble)! - fix: Use Windows SYSTEMROOT env var for finding netstat

  Currently, the drive letter of os.homedir() (the user's home directory) is used to build the path to netstat.exe. However, user directories are not always on the same drive as the Windows installation, in which case the path to netstat will be incorrect. Now we use the %SYSTEMROOT% environment variable which correctly points to the installation path of Windows.

* [#4768](https://github.com/cloudflare/workers-sdk/pull/4768) [`c3e410c2`](https://github.com/cloudflare/workers-sdk/commit/c3e410c2797f5c59b9ea0f63c20feef643366df2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - ci: bump undici versions to 5.28.2

* Updated dependencies [[`c3e410c2`](https://github.com/cloudflare/workers-sdk/commit/c3e410c2797f5c59b9ea0f63c20feef643366df2)]:
  - miniflare@3.20231218.3

## 3.23.0

### Minor Changes

- [#4310](https://github.com/cloudflare/workers-sdk/pull/4310) [`dae30015`](https://github.com/cloudflare/workers-sdk/commit/dae30015c646502819d79bf8b8ae032c4aa0669d) Thanks [@gabivlj](https://github.com/gabivlj)! - Added `wrangler cloudchamber` commands

  See [#4310](https://github.com/cloudflare/workers-sdk/pull/4310) for more details.

### Patch Changes

- [#4674](https://github.com/cloudflare/workers-sdk/pull/4674) [`54ea6a53`](https://github.com/cloudflare/workers-sdk/commit/54ea6a53bd1f222308135ed96bbb16a019302382) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - Fix usage of patch API in bulk secrets update

  Only specifying the name and type of a binding instructs the patch API to copy the existing binding over - but we were including the contents of the binding as well. Normally that's OK, but there are some subtle differences between what you specify to _create_ a binding vs what it looks like once it's _created_, specifically for Durable Objects. So instead, we just use the simpler inheritance.

* [#4772](https://github.com/cloudflare/workers-sdk/pull/4772) [`4a9f03cf`](https://github.com/cloudflare/workers-sdk/commit/4a9f03cf56c3041b5ad77a7d66f6458777d1e655) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure dev server doesn't change request URLs

  Previously, Wrangler's dev server could change incoming request URLs unexpectedly (e.g. rewriting `http://localhost:8787//test` to `http://localhost:8787/test`). This change ensures URLs are passed through without modification.

  Fixes #4743.

## 3.22.5

### Patch Changes

- [#4707](https://github.com/cloudflare/workers-sdk/pull/4707) [`96a27f3d`](https://github.com/cloudflare/workers-sdk/commit/96a27f3d8a250c995907773d1aa695f80d43d9d0) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: only offer to report unknown errors

  Previously, Wrangler would offer to report any error to Cloudflare. This included errors caused by misconfigurations or invalid commands. This change ensures those types of errors aren't reported.

* [#4676](https://github.com/cloudflare/workers-sdk/pull/4676) [`078cf84d`](https://github.com/cloudflare/workers-sdk/commit/078cf84dcdd8bfce3f80f0ccaf6d2afa714245c4) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - make sure the script path is correctly resolved in `pages dev` when no directory is specified

- [#4722](https://github.com/cloudflare/workers-sdk/pull/4722) [`5af6df13`](https://github.com/cloudflare/workers-sdk/commit/5af6df1371166886ce16d8f0cdea04a1bc401cae) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: don't require auth for `wrangler r2 object --local` operations

  Previously, Wrangler would ask you to login when reading or writing from local R2 buckets. This change ensures no login prompt is displayed, as authentication isn't required for these operations.

* [#4719](https://github.com/cloudflare/workers-sdk/pull/4719) [`c37d94b5`](https://github.com/cloudflare/workers-sdk/commit/c37d94b51f4d5517c244f8a4178be6a266d2362e) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure `miniflare` and `wrangler` can source map in the same process

  Previously, if in a `wrangler dev` session you called `console.log()` and threw an unhandled error you'd see an error like `[ERR_ASSERTION]: The expression evaluated to a falsy value`. This change ensures you can do both of these things in the same session.

- [#4683](https://github.com/cloudflare/workers-sdk/pull/4683) [`24147166`](https://github.com/cloudflare/workers-sdk/commit/24147166a3cb8f5ca2612646a494dc80cb399f79) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure logs containing `at` not truncated to `at [object Object]`

  Previously, logs containing `at` were always treated as stack trace call sites requiring source mapping. This change updates the call site detection to avoid false positives.

* [#4748](https://github.com/cloudflare/workers-sdk/pull/4748) [`3603a60d`](https://github.com/cloudflare/workers-sdk/commit/3603a60d4b06801cf5ce9ee693d467426afa997f) Thanks [@Cherry](https://github.com/Cherry)! - fix: resolve imports in a more node-like fashion for packages that do not declare exports

  Previously, trying to import a file that wasn't explicitly exported from a module would result in an error, but now, better attempts are made to resolve the import using node's module resolution algorithm. It's now possible to do things like this:

  ```js
  import JPEG_DEC_WASM from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm";
  ```

  This works even if the `mozjpeg_dec.wasm` file isn't explicitly exported from the `@jsquash/jpeg` module.

  Fixes #4726

- [#4687](https://github.com/cloudflare/workers-sdk/pull/4687) [`0a488f66`](https://github.com/cloudflare/workers-sdk/commit/0a488f6616618ce67ee22a4402d4b7477669b075) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: remove confusing `--local` messaging from `wrangler pages dev`

  Running `wrangler pages dev` would previously log a warning saying `--local is no longer required` even though `--local` was never set. This change removes this warning.

- Updated dependencies [[`4f6999ea`](https://github.com/cloudflare/workers-sdk/commit/4f6999eacd591d0d65180f805f2abc3c8a2c06c4), [`c37d94b5`](https://github.com/cloudflare/workers-sdk/commit/c37d94b51f4d5517c244f8a4178be6a266d2362e)]:
  - miniflare@3.20231218.2

## 3.22.4

### Patch Changes

- [#4699](https://github.com/cloudflare/workers-sdk/pull/4699) [`4b4c1416`](https://github.com/cloudflare/workers-sdk/commit/4b4c1416fec5f0de74a8abadbf5103b40b9929ea) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: prevent repeated reloads with circular service bindings

  `wrangler@3.19.0` introduced a bug where starting multiple `wrangler dev` sessions with service bindings to each other resulted in a reload loop. This change ensures Wrangler only reloads when dependent `wrangler dev` sessions start/stop.

## 3.22.3

### Patch Changes

- [#4693](https://github.com/cloudflare/workers-sdk/pull/4693) [`93e88c43`](https://github.com/cloudflare/workers-sdk/commit/93e88c433fdd82db63b332559efaabef6c482e88) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure `wrangler dev` exits with code `0` on clean exit

  Previously, `wrangler dev` would exit with a non-zero exit code when pressing <kbd>CTRL</kbd>+<kbd>C</kbd> or <kbd>x</kbd>. This change ensures `wrangler` exits with code `0` in these cases.

* [#4630](https://github.com/cloudflare/workers-sdk/pull/4630) [`037de5ec`](https://github.com/cloudflare/workers-sdk/commit/037de5ec77efc8261860c6d625bc90cd1f2fdd41) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure User Worker gets the correct Host header in wrangler dev local mode

  Some full-stack frameworks, such as Next.js, check that the Host header for a server
  side action request matches the host where the application is expected to run.

  In `wrangler dev` we have a Proxy Worker in between the browser and the actual User Worker.
  This Proxy Worker is forwarding on the request from the browser, but then the actual User
  Worker is running on a different host:port combination than that which the browser thinks
  it should be on. This was causing the framework to think the request is malicious and blocking
  it.

  Now we update the request's Host header to that passed from the Proxy Worker in a custom `MF-Original-Url`
  header, but only do this if the request also contains a shared secret between the Proxy Worker
  and User Worker, which is passed via the `MF-Proxy-Shared-Secret` header. This last feature is to
  prevent a malicious website from faking the Host header in a request directly to the User Worker.

  Fixes https://github.com/cloudflare/next-on-pages/issues/588

- [#4695](https://github.com/cloudflare/workers-sdk/pull/4695) [`0f8a03c0`](https://github.com/cloudflare/workers-sdk/commit/0f8a03c06aa3180799cf03b1e60c348620115600) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure API failures without additional messages logged correctly

* [#4693](https://github.com/cloudflare/workers-sdk/pull/4693) [`93e88c43`](https://github.com/cloudflare/workers-sdk/commit/93e88c433fdd82db63b332559efaabef6c482e88) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure `wrangler pages dev` exits cleanly

  Previously, pressing <kbd>CTRL</kbd>+<kbd>C</kbd> or <kbd>x</kbd> when running `wrangler pages dev` wouldn't actually exit `wrangler`. You'd need to press <kbd>CTRL</kbd>+<kbd>C</kbd> a second time to exit the process. This change ensures `wrangler` exits the first time.

- [#4696](https://github.com/cloudflare/workers-sdk/pull/4696) [`624084c4`](https://github.com/cloudflare/workers-sdk/commit/624084c447a4898c4273c26e3ea24ea069a2900b) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: include additional modules in `largest dependencies` warning

  If your Worker fails to deploy because it's too large, Wrangler will display of list of your Worker's largest dependencies. Previously, this just included JavaScript dependencies. This change ensures additional module dependencies (e.g. WebAssembly, text blobs, etc.) are included when computing this list.

- Updated dependencies [[`037de5ec`](https://github.com/cloudflare/workers-sdk/commit/037de5ec77efc8261860c6d625bc90cd1f2fdd41)]:
  - miniflare@3.20231218.1

## 3.22.2

### Patch Changes

- [#4600](https://github.com/cloudflare/workers-sdk/pull/4600) [`4233e514`](https://github.com/cloudflare/workers-sdk/commit/4233e5149d7dafe44c22a59b33310744fc02efc6) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: apply source mapping to deployment validation errors

  Previously if a Worker failed validation during `wrangler deploy`, the displayed error would reference locations in built JavaScript files. This made it more difficult to debug validation errors. This change ensures these errors are now source mapped, referencing locations in source files instead.

* [#4440](https://github.com/cloudflare/workers-sdk/pull/4440) [`15717333`](https://github.com/cloudflare/workers-sdk/commit/157173338a9f6a0701fd47711ff321be0dcbb037) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: automatically create required directories for `wrangler r2 object get`

  Previously, if you tried to use `wrangler r2 object get` with an object name containing a `/` or used the `--file` flag with a path containing a `/`, and the specified directory didn't exist, Wrangler would throw an `ENOENT` error. This change ensures Wrangler automatically creates required parent directories if they don't exist.

- [#4592](https://github.com/cloudflare/workers-sdk/pull/4592) [`20da658e`](https://github.com/cloudflare/workers-sdk/commit/20da658ee3cc2c6684b68fd7b7da389dd5de6a0f) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: throw helpful error if email validation required

  Previously, Wrangler would display the raw API error message and code if email validation was required during `wrangler deploy`. This change ensures a helpful error message is displayed instead, prompting users to check their emails or visit the dashboard for a verification link.

* [#4597](https://github.com/cloudflare/workers-sdk/pull/4597) [`e1d50407`](https://github.com/cloudflare/workers-sdk/commit/e1d504077ab6b0bd996df58ebda76918c2fee076) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: suggest checking permissions on authentication error with API token set

- [#4593](https://github.com/cloudflare/workers-sdk/pull/4593) [`c370026d`](https://github.com/cloudflare/workers-sdk/commit/c370026d3f07f7214e33aa44ad507fe1e97bdfdd) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: include messages from API in errors

* [#4588](https://github.com/cloudflare/workers-sdk/pull/4588) [`4e5ed0b2`](https://github.com/cloudflare/workers-sdk/commit/4e5ed0b28383602db9aa48658811a01ccfb8e5c2) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: require worker name for rollback

  Previously, Wrangler would fail with a cryptic error if you tried to run `wrangler rollback` outside of a directory containing a Wrangler configuration file with a `name` defined. This change validates that a worker name is defined, and allows you to set it from the command line using the `--name` flag.

* Updated dependencies [[`c410ea14`](https://github.com/cloudflare/workers-sdk/commit/c410ea141f02f808ff3dddfa9ee21ccbb530acec)]:
  - miniflare@3.20231218.0

## 3.22.1

### Patch Changes

- [#4635](https://github.com/cloudflare/workers-sdk/pull/4635) [`5bc2699d`](https://github.com/cloudflare/workers-sdk/commit/5bc2699d9ec8b591b294df342bf12ac0b16eb814) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: prevent zombie `workerd` processes

  Previously, running `wrangler dev` would leave behind "zombie" `workerd` processes. These processes prevented the same port being bound if `wrangler dev` was restarted and sometimes consumed lots of CPU time. This change ensures all `workerd` processes are killed when `wrangler dev` is shutdown.

  To clean-up existing zombie processes, run `pkill -KILL workerd` on macOS/Linux or `taskkill /f /im workerd.exe` on Windows.

## 3.22.0

### Minor Changes

- [#4632](https://github.com/cloudflare/workers-sdk/pull/4632) [`a6a4e8a4`](https://github.com/cloudflare/workers-sdk/commit/a6a4e8a4981f390709ae7519225a02cd981059b4) Thanks [@G4brym](https://github.com/G4brym)! - Deprecate constellation commands and add a warning when using the constellation binding

* [#4130](https://github.com/cloudflare/workers-sdk/pull/4130) [`e8a2a1d9`](https://github.com/cloudflare/workers-sdk/commit/e8a2a1d9ddded5b4c472750e80011895f14b9315) Thanks [@vkrasnov](https://github.com/vkrasnov)! - Added support for R2 Sippy incremental migration

- [#4621](https://github.com/cloudflare/workers-sdk/pull/4621) [`98dee932`](https://github.com/cloudflare/workers-sdk/commit/98dee932811aef5e50065d8d9d9ba9728ad84c20) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: add rows written/read in the last 24 hours to `wrangler d1 info` output

* [#4426](https://github.com/cloudflare/workers-sdk/pull/4426) [`c628de59`](https://github.com/cloudflare/workers-sdk/commit/c628de591a0d436b5496dac53d771d92ee5d406a) Thanks [@OilyLime](https://github.com/OilyLime)! - Improve queues list displaying as table, update queues API types

## 3.21.0

### Minor Changes

- [#4423](https://github.com/cloudflare/workers-sdk/pull/4423) [`a94ef570`](https://github.com/cloudflare/workers-sdk/commit/a94ef5700ade9d96e4060dd590a7b3f0bd2e28c1) Thanks [@mrbbot](https://github.com/mrbbot)! - feat: apply source mapping to logged strings

  Previously, Wrangler would only apply source mapping to uncaught exceptions. This meant if you caught an exception and logged its stack trace, the call sites would reference built JavaScript files as opposed to source files. This change looks for stack traces in logged messages, and tries to source map them.

  Note source mapping is only applied when outputting logs. `Error#stack` does not return a source mapped stack trace. This means the actual runtime value of `new Error().stack` and the output from `console.log(new Error().stack)` may be different.

### Patch Changes

- [#4511](https://github.com/cloudflare/workers-sdk/pull/4511) [`66394681`](https://github.com/cloudflare/workers-sdk/commit/66394681d99b8afa7c56274388eb7085afb41916) Thanks [@huw](https://github.com/huw)! - Add 'took recursive isolate lock' warning to workerd output exceptions

## 3.20.0

### Minor Changes

- [#4522](https://github.com/cloudflare/workers-sdk/pull/4522) [`c10bf0fd`](https://github.com/cloudflare/workers-sdk/commit/c10bf0fd2f24681cfcb78c6bf700a2e4acf41f30) Thanks [@G4brym](https://github.com/G4brym)! - Add support for Workers AI in local mode

* [#4571](https://github.com/cloudflare/workers-sdk/pull/4571) [`3314dbde`](https://github.com/cloudflare/workers-sdk/commit/3314dbdea2eeacb2d26d9bae867cbd3649ac73b3) Thanks [@penalosa](https://github.com/penalosa)! - feat: When Wrangler crashes, send an error report to Sentry to aid in debugging.

  When Wrangler's top-level exception handler catches an error thrown from Wrangler's application, it will offer to report the error to Sentry. This requires opt-in from the user every time.

### Patch Changes

- [#4577](https://github.com/cloudflare/workers-sdk/pull/4577) [`4c85fe99`](https://github.com/cloudflare/workers-sdk/commit/4c85fe9976a3a2d60cf8508b9a090331027baf37) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - During the R2 validation, show `MAX_UPLOAD_SIZE` errors using MiB (consistently with the Cloudflare docs)

* [#4577](https://github.com/cloudflare/workers-sdk/pull/4577) [`4c85fe99`](https://github.com/cloudflare/workers-sdk/commit/4c85fe9976a3a2d60cf8508b9a090331027baf37) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - During the Pages validation, show `MAX_UPLOAD_SIZE` errors using MiB (consistently with the Cloudflare docs)

* Updated dependencies [[`eb08e2dc`](https://github.com/cloudflare/workers-sdk/commit/eb08e2dc3c0f09d16883f85201fbeb892e6f5a5b)]:
  - miniflare@3.20231030.4

## 3.19.0

### Minor Changes

- [#4547](https://github.com/cloudflare/workers-sdk/pull/4547) [`86c81ff0`](https://github.com/cloudflare/workers-sdk/commit/86c81ff0d59e79d2d33f176f69a7c2d1dcd91e02) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: listen on IPv4 loopback only by default on Windows

  Due to a [known issue](https://github.com/cloudflare/workerd/issues/1408), `workerd` will only listen on the IPv4 loopback address `127.0.0.1` when it's asked to listen on `localhost`. On Node.js > 17, `localhost` will resolve to the IPv6 loopback address, meaning requests to `workerd` would fail. This change switches to using the IPv4 loopback address throughout Wrangler on Windows, while [workerd#1408](https://github.com/cloudflare/workerd/issues/1408) gets fixed.

* [#4535](https://github.com/cloudflare/workers-sdk/pull/4535) [`29df8e17`](https://github.com/cloudflare/workers-sdk/commit/29df8e17545bf3926b6d61678b596be809d40c6d) Thanks [@mrbbot](https://github.com/mrbbot)! - Reintroduces some internal refactorings of wrangler dev servers (including `wrangler dev`, `wrangler dev --remote`, and `unstable_dev()`).

  These changes were released in 3.13.0 and reverted in 3.13.1 -- we believe the changes are now more stable and ready for release again.

  There are no changes required for developers to opt-in. Improvements include:

  - fewer 'address in use' errors upon reloads
  - upon config/source file changes, requests are buffered to guarantee the response is from the new version of the Worker

### Patch Changes

- [#4521](https://github.com/cloudflare/workers-sdk/pull/4521) [`6c5bc704`](https://github.com/cloudflare/workers-sdk/commit/6c5bc704c5a13aab58b765c57b700204bc0830bf) Thanks [@zebp](https://github.com/zebp)! - fix: init from dash specifying explicit usage model in wrangler.toml for standard users

* [#4550](https://github.com/cloudflare/workers-sdk/pull/4550) [`63708a94`](https://github.com/cloudflare/workers-sdk/commit/63708a94fb7a055bf15fa963f2d598b47b11d3c0) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: validate `Host` and `Orgin` headers where appropriate

  `Host` and `Origin` headers are now checked when connecting to the inspector and Miniflare's magic proxy. If these don't match what's expected, the request will fail.

* Updated dependencies [[`71fb0b86`](https://github.com/cloudflare/workers-sdk/commit/71fb0b86cf0ed81cc29ad71792edbba3a79ba87c), [`63708a94`](https://github.com/cloudflare/workers-sdk/commit/63708a94fb7a055bf15fa963f2d598b47b11d3c0)]:
  - miniflare@3.20231030.3

## 3.18.0

### Minor Changes

- [#4532](https://github.com/cloudflare/workers-sdk/pull/4532) [`311ffbd5`](https://github.com/cloudflare/workers-sdk/commit/311ffbd5064f8301ac6f0311bbe5630897923b93) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: change `wrangler (pages) dev` to listen on `localhost` by default

  Previously, Wrangler listened on all interfaces (`*`) by default. This change switches `wrangler (pages) dev` to just listen on local interfaces. Whilst this is technically a breaking change, we've decided the security benefits outweigh the potential disruption caused. If you need to access your dev server from another device on your network, you can use `wrangler (pages) dev --ip *` to restore the previous behaviour.

### Patch Changes

- Updated dependencies [[`1b348782`](https://github.com/cloudflare/workers-sdk/commit/1b34878287e3c98e8743e0a9c30b860107d4fcbe)]:
  - miniflare@3.20231030.2

## 3.17.1

### Patch Changes

- [#4474](https://github.com/cloudflare/workers-sdk/pull/4474) [`382ef8f5`](https://github.com/cloudflare/workers-sdk/commit/382ef8f580ab755d2706692e865b619953ef5671) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: open browser to correct url pressing `b` in `--remote` mode

  This change ensures Wrangler doesn't try to open `http://*` when `*` is used as the dev server's hostname. Instead, Wrangler will now open `http://127.0.0.1`.

* [#4488](https://github.com/cloudflare/workers-sdk/pull/4488) [`3bd57238`](https://github.com/cloudflare/workers-sdk/commit/3bd5723852c8340d04930e056ef1e8f97dc316ae) Thanks [@RamIdeas](https://github.com/RamIdeas)! - Changes the default directory for log files to workaround frameworks that are watching the entire `.wrangler` directory in the project root for changes

  Also includes a fix for commands with `--json` where the log file location message would cause stdout to not be valid JSON. That message now goes to stderr.

## 3.17.0

### Minor Changes

- [#4341](https://github.com/cloudflare/workers-sdk/pull/4341) [`d9908743`](https://github.com/cloudflare/workers-sdk/commit/d99087433814e4f1fb98cd61b03b6e2f606b1a15) Thanks [@RamIdeas](https://github.com/RamIdeas)! - Wrangler now writes all logs to a .log file in the `.wrangler` directory. Set a directory or specific .log filepath to write logs to with `WRANGLER_LOG_PATH=../Desktop/my-logs/` or `WRANGLER_LOG_PATH=../Desktop/my-logs/my-log-file.log`. When specifying a directory or using the default location, a filename with a timestamp is used.

  Wrangler now filters workerd stdout/stderr and marks unactionable messages as debug logs. These debug logs are still observable in the debug log file but will no longer show in the terminal by default without the user setting the env var `WRANGLER_LOG=debug`.

### Patch Changes

- [#4469](https://github.com/cloudflare/workers-sdk/pull/4469) [`d5e1966b`](https://github.com/cloudflare/workers-sdk/commit/d5e1966b24e65aa5591739c0b950e4635ac5fa19) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: report correct line and column numbers when source mapping errors with `wrangler dev --remote`

* [#4455](https://github.com/cloudflare/workers-sdk/pull/4455) [`1747d215`](https://github.com/cloudflare/workers-sdk/commit/1747d215e7113909edf0596e713b808024c36c70) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: make it possible to ignore hyperdrive warnings

- [#4456](https://github.com/cloudflare/workers-sdk/pull/4456) [`805d5241`](https://github.com/cloudflare/workers-sdk/commit/805d5241ac7831ed46e5e2bc8bb4ffc062160d56) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add warnings about ai and verctorize bindings not being supported locally

* [#4478](https://github.com/cloudflare/workers-sdk/pull/4478) [`7b54350b`](https://github.com/cloudflare/workers-sdk/commit/7b54350b6d21c836f16f9942da982f5d361727cf) Thanks [@penalosa](https://github.com/penalosa)! - Don't log sensitive data to the Wrangler debug log file by default. This includes API request headers and responses.

* Updated dependencies [[`be2b9cf5`](https://github.com/cloudflare/workers-sdk/commit/be2b9cf5a9395cf7385f59d2e1ec3131dae3d87f), [`d9908743`](https://github.com/cloudflare/workers-sdk/commit/d99087433814e4f1fb98cd61b03b6e2f606b1a15)]:
  - miniflare@3.20231030.1

## 3.16.0

### Minor Changes

- [#4347](https://github.com/cloudflare/workers-sdk/pull/4347) [`102e15f9`](https://github.com/cloudflare/workers-sdk/commit/102e15f9e735ff7506cfff457046137ee7b03c32) Thanks [@Skye-31](https://github.com/Skye-31)! - Feat(unstable_dev): Provide an option for unstable_dev to perform the check that prompts users to update wrangler, defaulting to false. This will prevent unstable_dev from sending a request to NPM on startup to determine whether it needs to be updated.

* [#4179](https://github.com/cloudflare/workers-sdk/pull/4179) [`dd270d00`](https://github.com/cloudflare/workers-sdk/commit/dd270d0065159150ff318f2f06607ddecba6ee9b) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - Simplify secret:bulk api via script settings

  Firing PUTs to the secret api in parallel has never been a great solution - each request independently needs to lock the script, so running in parallel is at best just as bad as running serially.

  Luckily, we have the script settings PATCH api now, which can update the settings for a script (including secret bindings) at once, which means we don't need any parallelization. However this api doesn't work with a partial list of bindings, so we have to fetch the current bindings and merge in with the new secrets before PATCHing. We can however just omit the value of the binding (i.e. only provide the name and type) which instructs the config service to inherit the existing value, which simplifies this as well. Note that we don't use the bindings in your current wrangler.toml, as you could be in a draft state, and it makes sense as a user that a bulk secrets update won't update anything else. Instead, we use script settings api again to fetch the current state of your bindings.

  This simplified implementation means the operation can only fail or succeed, rather than succeeding in updating some secrets but failing for others. In order to not introduce breaking changes for logging output, the language around "${x} secrets were updated" or "${x} secrets failed" is kept, even if it doesn't make much sense anymore.

### Patch Changes

- [#4402](https://github.com/cloudflare/workers-sdk/pull/4402) [`baa76e77`](https://github.com/cloudflare/workers-sdk/commit/baa76e774038393fb6b491e2c371da53b8b2a676) Thanks [@rozenmd](https://github.com/rozenmd)! - This PR adds a fetch handler that uses `page`, assuming `result_info` provided by the endpoint contains `page`, `per_page`, and `total`

  This is needed as the existing `fetchListResult` handler for fetching potentially paginated results doesn't work for endpoints that don't implement `cursor`.

  Fixes #4349

* [#4337](https://github.com/cloudflare/workers-sdk/pull/4337) [`6c8f41f8`](https://github.com/cloudflare/workers-sdk/commit/6c8f41f8e76890d6027fd97eaf4e88dccb509fc8) Thanks [@Skye-31](https://github.com/Skye-31)! - Improve the error message when a script isn't exported a Durable Object class

  Previously, wrangler would error with a message like `Uncaught TypeError: Class extends value undefined is not a constructor or null`. This improves that messaging to be more understandable to users.

- [#4307](https://github.com/cloudflare/workers-sdk/pull/4307) [`7fbe1937`](https://github.com/cloudflare/workers-sdk/commit/7fbe1937b311f36077c92814207bbb15ef3878d6) Thanks [@jspspike](https://github.com/jspspike)! - Change local dev server default ip to `*` instead of `0.0.0.0`. This will cause the dev server to listen on both ipv4 and ipv6 interfaces

* [#4222](https://github.com/cloudflare/workers-sdk/pull/4222) [`f867e01c`](https://github.com/cloudflare/workers-sdk/commit/f867e01ca2967a11a8d5eda32da42941383753a8) Thanks [@tmthecoder](https://github.com/tmthecoder)! - Support for hyperdrive bindings in local wrangler dev

- [#4149](https://github.com/cloudflare/workers-sdk/pull/4149) [`7e05f38e`](https://github.com/cloudflare/workers-sdk/commit/7e05f38e04e40125c9c5352b7ff1c95616c1baf0) Thanks [@jspspike](https://github.com/jspspike)! - Fixed issue with `tail` not using proxy

* [#4219](https://github.com/cloudflare/workers-sdk/pull/4219) [`0453b447`](https://github.com/cloudflare/workers-sdk/commit/0453b447251cc670310be6a2067c84074f6a515b) Thanks [@maxwellpeterson](https://github.com/maxwellpeterson)! - Allows uploads with both cron triggers and smart placement enabled

- [#4437](https://github.com/cloudflare/workers-sdk/pull/4437) [`05b1bbd2`](https://github.com/cloudflare/workers-sdk/commit/05b1bbd2f5b8e60268e30c276067c3a3ae1239cf) Thanks [@jspspike](https://github.com/jspspike)! - Change dev registry and inspector server to listen on 127.0.0.1 instead of all interfaces

- Updated dependencies [[`4f8b3420`](https://github.com/cloudflare/workers-sdk/commit/4f8b3420f93197d331491f012ff6f4626411bfc5), [`16cc2e92`](https://github.com/cloudflare/workers-sdk/commit/16cc2e923733b3c583b5bf6c40384c52fea04991), [`3637d97a`](https://github.com/cloudflare/workers-sdk/commit/3637d97a99c9d5e8d0d2b5f3adaf4bd9993265f0), [`29a59d4e`](https://github.com/cloudflare/workers-sdk/commit/29a59d4e72e3ae849474325c5c93252a3f84af0d), [`7fbe1937`](https://github.com/cloudflare/workers-sdk/commit/7fbe1937b311f36077c92814207bbb15ef3878d6), [`76787861`](https://github.com/cloudflare/workers-sdk/commit/767878613eda535d125539a478d488d1a42feaa1), [`8a25b7fb`](https://github.com/cloudflare/workers-sdk/commit/8a25b7fba94c8e9989412bc266ada307975f182d)]:
  - miniflare@3.20231030.0

## 3.15.0

### Minor Changes

- [#4201](https://github.com/cloudflare/workers-sdk/pull/4201) [`0cac2c46`](https://github.com/cloudflare/workers-sdk/commit/0cac2c4681852709883ea91f5b73c5af1f70088a) Thanks [@penalosa](https://github.com/penalosa)! - Callout `--minify` when script size is too large

* [#4209](https://github.com/cloudflare/workers-sdk/pull/4209) [`24d1c5cf`](https://github.com/cloudflare/workers-sdk/commit/24d1c5cf3b810e780df865a0f76f1c3ae8ed5fbe) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: suppress compatibility date fallback warnings if no `wrangler` update is available

  If a compatibility date greater than the installed version of `workerd` was
  configured, a warning would be logged. This warning was only actionable if a new
  version of `wrangler` was available. The intent here was to warn if a user set
  a new compatibility date, but forgot to update `wrangler` meaning changes
  enabled by the new date wouldn't take effect. This change hides the warning if
  no update is available.

  It also changes the default compatibility date for `wrangler dev` sessions
  without a configured compatibility date to the installed version of `workerd`.
  This previously defaulted to the current date, which may have been unsupported
  by the installed runtime.

- [#4135](https://github.com/cloudflare/workers-sdk/pull/4135) [`53218261`](https://github.com/cloudflare/workers-sdk/commit/532182610087dffda04cc2091baeceb96e7fdb26) Thanks [@Cherry](https://github.com/Cherry)! - feat: resolve npm exports for file imports

  Previously, when using wasm (or other static files) from an npm package, you would have to import the file like so:

  ```js
  import wasm from "../../node_modules/svg2png-wasm/svg2png_wasm_bg.wasm";
  ```

  This update now allows you to import the file like so, assuming it's exposed and available in the package's `exports` field:

  ```js
  import wasm from "svg2png-wasm/svg2png_wasm_bg.wasm";
  ```

  This will look at the package's `exports` field in `package.json` and resolve the file using [`resolve.exports`](https://www.npmjs.com/package/resolve.exports).

* [#4232](https://github.com/cloudflare/workers-sdk/pull/4232) [`69b43030`](https://github.com/cloudflare/workers-sdk/commit/69b43030b99a21a3e4cad5285aa8253ebee8a392) Thanks [@romeupalos](https://github.com/romeupalos)! - fix: use `zone_name` to determine a zone when the pattern is a custom hostname

  In Cloudflare for SaaS, custom hostnames of third party domain owners can be used in Cloudflare.
  Workers are allowed to intercept these requests based on the routes configuration.
  Before this change, the same logic used by `wrangler dev` was used in `wrangler deploy`, which caused wrangler to fail with:

  ✘ [ERROR] Could not find zone for [partner-saas-domain.com]

- [#4198](https://github.com/cloudflare/workers-sdk/pull/4198) [`b404ab70`](https://github.com/cloudflare/workers-sdk/commit/b404ab707b324685235b522ee66bd6e8351f62be) Thanks [@penalosa](https://github.com/penalosa)! - When uploading additional modules with your worker, Wrangler will now report the (uncompressed) size of each individual module, as well as the aggregate size of your Worker

### Patch Changes

- [#4215](https://github.com/cloudflare/workers-sdk/pull/4215) [`950bc401`](https://github.com/cloudflare/workers-sdk/commit/950bc4015fa408bfcd4fbf771cf1c3a062783d96) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix various logging of shell commands to correctly quote args when needed

* [#4274](https://github.com/cloudflare/workers-sdk/pull/4274) [`be0c6283`](https://github.com/cloudflare/workers-sdk/commit/be0c62834af0692785785cec8a0d7bc9dcfaa61a) Thanks [@jspspike](https://github.com/jspspike)! - chore: bump `miniflare` to [`3.20231025.0`](https://github.com/cloudflare/miniflare/releases/tag/v3.20231025.0)

  This change enables Node-like `console.log()`ing in local mode. Objects with
  lots of properties, and instances of internal classes like `Request`, `Headers`,
  `ReadableStream`, etc will now be logged with much more detail.

- [#4127](https://github.com/cloudflare/workers-sdk/pull/4127) [`3d55f965`](https://github.com/cloudflare/workers-sdk/commit/3d55f9656ddb28c7cbe1c03a9409be7af30d6f7d) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: store temporary files in `.wrangler`

  As Wrangler builds your code, it writes intermediate files to a temporary
  directory that gets cleaned up on exit. Previously, Wrangler used the OS's
  default temporary directory. On Windows, this is usually on the `C:` drive.
  If your source code was on a different drive, our bundling tool would generate
  invalid source maps, breaking breakpoint debugging. This change ensures
  intermediate files are always written to the same drive as sources. It also
  ensures unused build outputs are cleaned up when running `wrangler pages dev`.

  This change also means you no longer need to set `cwd` and
  `resolveSourceMapLocations` in `.vscode/launch.json` when creating an `attach`
  configuration for breakpoint debugging. Your `.vscode/launch.json` should now
  look something like...

  ```jsonc
  {
  	"configurations": [
  		{
  			"name": "Wrangler",
  			"type": "node",
  			"request": "attach",
  			"port": 9229,
  			// These can be omitted, but doing so causes silent errors in the runtime
  			"attachExistingChildren": false,
  			"autoAttachChildProcesses": false,
  		},
  	],
  }
  ```

* [#4189](https://github.com/cloudflare/workers-sdk/pull/4189) [`05798038`](https://github.com/cloudflare/workers-sdk/commit/05798038c85a83afb2c0e8ea9533c31a6fbe3e91) Thanks [@gabivlj](https://github.com/gabivlj)! - Move helper cli files of C3 into @cloudflare/cli and make Wrangler and C3 depend on it

- [#4235](https://github.com/cloudflare/workers-sdk/pull/4235) [`46cd2df5`](https://github.com/cloudflare/workers-sdk/commit/46cd2df5745ef90f4d9577504f203d2753ca56e9) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure `console.log()`s during startup are displayed

  Previously, `console.log()` calls before the Workers runtime was ready to
  receive requests wouldn't be shown. This meant any logs in the global scope
  likely weren't visible. This change ensures startup logs are shown. In particular,
  this should [fix Remix's HMR](https://github.com/remix-run/remix/issues/7616),
  which relies on startup logs to know when the Worker is ready.

## 3.14.0

### Minor Changes

- [#4204](https://github.com/cloudflare/workers-sdk/pull/4204) [`38fdbe9b`](https://github.com/cloudflare/workers-sdk/commit/38fdbe9b75af6a588fe4bc8387be45610149c2f3) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - Support user limits for CPU time

  User limits provided via script metadata on upload

  Example configuration:

  ```
  [limits]
  cpu_ms = 20000
  ```

* [#2162](https://github.com/cloudflare/workers-sdk/pull/2162) [`a1f212e6`](https://github.com/cloudflare/workers-sdk/commit/a1f212e6423fd251612b1b3c2ac9f254daa8fa4c) Thanks [@WalshyDev](https://github.com/WalshyDev)! - add support for service bindings in `wrangler pages dev` by providing the
  new `--service`|`-s` flag which accepts an array of `BINDING_NAME=SCRIPT_NAME`
  where `BINDING_NAME` is the name of the binding and `SCRIPT_NAME` is the name
  of the worker (as defined in its `wrangler.toml`), such workers need to be
  running locally with with `wrangler dev`.

  For example if a user has a worker named `worker-a`, in order to locally bind
  to that they'll need to open two different terminals, in each navigate to the
  respective worker/pages application and then run respectively `wrangler dev` and
  `wrangler pages ./publicDir --service MY_SERVICE=worker-a` this will add the
  `MY_SERVICE` binding to pages' worker `env` object.

  Note: additionally after the `SCRIPT_NAME` the name of an environment can be specified,
  prefixed by an `@` (as in: `MY_SERVICE=SCRIPT_NAME@PRODUCTION`), this behavior is however
  experimental and not fully properly defined.

## 3.13.2

### Patch Changes

- [#4206](https://github.com/cloudflare/workers-sdk/pull/4206) [`8e927170`](https://github.com/cloudflare/workers-sdk/commit/8e927170c4b6ce4310e563ce528c2ea20d3de9e7) Thanks [@1000hz](https://github.com/1000hz)! - chore: bump `miniflare` to [`3.20231016.0`](https://github.com/cloudflare/miniflare/releases/tag/v3.20231016.0)

* [#4144](https://github.com/cloudflare/workers-sdk/pull/4144) [`54800f6f`](https://github.com/cloudflare/workers-sdk/commit/54800f6f2dc52b921e7dd1d9a57bb437e2094bb0) Thanks [@a-robinson](https://github.com/a-robinson)! - Log a warning when using a Hyperdrive binding in local wrangler dev

## 3.13.1

### Patch Changes

- [#4171](https://github.com/cloudflare/workers-sdk/pull/4171) [`88f15f61`](https://github.com/cloudflare/workers-sdk/commit/88f15f61cad2a69c07e26203cc84ddb2da42deb3) Thanks [@penalosa](https://github.com/penalosa)! - patch: This release fixes some regressions related to running `wrangler dev` that were caused by internal refactoring of the dev server architecture ([#3960](https://github.com/cloudflare/workers-sdk/pull/3960)). The change has been reverted, and will be added back in a future release.

## 3.13.0

### Minor Changes

- [#4161](https://github.com/cloudflare/workers-sdk/pull/4161) [`403bc25c`](https://github.com/cloudflare/workers-sdk/commit/403bc25c4fa56a3ddf8a6af166d99919f565c497) Thanks [@RamIdeas](https://github.com/RamIdeas)! - Fix wrangler generated types to match runtime exports

* [#3960](https://github.com/cloudflare/workers-sdk/pull/3960) [`c36b78b4`](https://github.com/cloudflare/workers-sdk/commit/c36b78b4109c05f47556972e66673f64ec0baa3b) Thanks [@RamIdeas](https://github.com/RamIdeas)! - Refactoring the internals of wrangler dev servers (including `wrangler dev`, `wrangler dev --remote` and `unstable_dev()`).

  There are no changes required for developers to opt-in. Improvements include:

  - fewer 'address in use' errors upon reloads
  - upon config/source file changes, requests are buffered to guarantee the response is from the new version of the Worker

### Patch Changes

- [#3590](https://github.com/cloudflare/workers-sdk/pull/3590) [`f4ad634a`](https://github.com/cloudflare/workers-sdk/commit/f4ad634af86c49ade427af23e3853c656e30250a) Thanks [@penalosa](https://github.com/penalosa)! - fix: When a middleware is configured which doesn't support your Worker's script format, fail early with a helpful error message

## 3.12.0

### Minor Changes

- [#4071](https://github.com/cloudflare/workers-sdk/pull/4071) [`f880a009`](https://github.com/cloudflare/workers-sdk/commit/f880a009ad7c7ec26a85c51f577164522a307217) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - Support TailEvent messages in Tail sessions

  When tailing a tail worker, messages previously had a null event property. Following https://github.com/cloudflare/workerd/pull/1248, these events have a valid event, specifying which scripts produced events that caused your tail worker to run.

  As part of rolling this out, we're filtering out tail events in the internal tail infrastructure, so we control when these new messages are forward to tail sessions, and can merge this freely.

  One idiosyncracy to note, however, is that tail workers always report an "OK" status, even if they run out of memory or throw. That is being tracked and worked on separately.

* [#2397](https://github.com/cloudflare/workers-sdk/pull/2397) [`93833f04`](https://github.com/cloudflare/workers-sdk/commit/93833f0418443232bb29daf46559c8e1db754dde) Thanks [@a-robinson](https://github.com/a-robinson)! - feature: Support Queue consumer events in tail

  So that it's less confusing when tailing a worker that consumes events from a Queue.

### Patch Changes

- [#2687](https://github.com/cloudflare/workers-sdk/pull/2687) [`3077016f`](https://github.com/cloudflare/workers-sdk/commit/3077016f6112754585c05b7952e456be44b9d8cd) Thanks [@jrf0110](https://github.com/jrf0110)! - Fixes large Pages projects failing to complete direct upload due to expiring JWTs

  For projects which are slow to upload - either because of client bandwidth or large numbers of files and sizes - It's possible for the JWT to expire multiple times. Since our network request concurrency is set to 3, it's possible that each time the JWT expires we get 3 failed attempts. This can quickly exhaust our upload attempt count and cause the entire process to bail.

  This change makes it such that jwt refreshes do not count as a failed upload attempt.

* [#4069](https://github.com/cloudflare/workers-sdk/pull/4069) [`f4d28918`](https://github.com/cloudflare/workers-sdk/commit/f4d28918c566c72782db9dadae12b95a376d082c) Thanks [@a-robinson](https://github.com/a-robinson)! - Default new Hyperdrive configs for PostgreSQL databases to port 5432 if the port is not specified

## 3.11.0

### Minor Changes

- [#3726](https://github.com/cloudflare/workers-sdk/pull/3726) [`7d20bdbd`](https://github.com/cloudflare/workers-sdk/commit/7d20bdbd4ed7c5003b327a58af8d5c402df9fe2b) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: support partial bundling with configurable external modules

  Setting `find_additional_modules` to `true` in your configuration file will now instruct Wrangler to look for files in
  your `base_dir` that match your configured `rules`, and deploy them as unbundled, external modules with your Worker.
  `base_dir` defaults to the directory containing your `main` entrypoint.

  Wrangler can operate in two modes: the default bundling mode and `--no-bundle` mode. In bundling mode, dynamic imports
  (e.g. `await import("./large-dep.mjs")`) would be bundled into your entrypoint, making lazy loading less effective.
  Additionally, variable dynamic imports (e.g. ``await import(`./lang/${language}.mjs`)``) would always fail at runtime,
  as Wrangler would have no way of knowing which modules to upload. The `--no-bundle` mode sought to address these issues
  by disabling Wrangler's bundling entirely, and just deploying code as is. Unfortunately, this also disabled Wrangler's
  code transformations (e.g. TypeScript compilation, `--assets`, `--test-scheduled`, etc).

  With this change, we now additionally support _partial bundling_. Files are bundled into a single Worker entry-point file
  unless `find_additional_modules` is `true`, and the file matches one of the configured `rules`. See
  https://developers.cloudflare.com/workers/wrangler/bundling/ for more details and examples.

* [#4093](https://github.com/cloudflare/workers-sdk/pull/4093) [`c71d8a0f`](https://github.com/cloudflare/workers-sdk/commit/c71d8a0f73c0abbf76434d7aa7634af53ce7b29b) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: bump `miniflare` to [`3.20231002.0`](https://github.com/cloudflare/miniflare/releases/tag/v3.20231002.0)

### Patch Changes

- [#3726](https://github.com/cloudflare/workers-sdk/pull/3726) [`7d20bdbd`](https://github.com/cloudflare/workers-sdk/commit/7d20bdbd4ed7c5003b327a58af8d5c402df9fe2b) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure that additional modules appear in the out-dir

  When using `find_additional_modules` (or `no_bundle`) we find files that
  will be uploaded to be deployed alongside the Worker.

  Previously, if an `outDir` was specified, only the Worker code was output
  to this directory. Now all additional modules are also output there too.

* [#4067](https://github.com/cloudflare/workers-sdk/pull/4067) [`31270711`](https://github.com/cloudflare/workers-sdk/commit/31270711fe3f48ff94138cf1626f44b8b052d698) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: generate valid source maps with `wrangler pages dev` on macOS

  On macOS, `wrangler pages dev` previously generated source maps with an
  incorrect number of `../`s in relative paths. This change ensures paths are
  always correct, improving support for breakpoint debugging.

- [#4084](https://github.com/cloudflare/workers-sdk/pull/4084) [`9a7559b6`](https://github.com/cloudflare/workers-sdk/commit/9a7559b67c1afe9c583b1255d5404385b4d7b9fc) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: respect the options.local value in unstable_dev (it was being ignored)

* [#4107](https://github.com/cloudflare/workers-sdk/pull/4107) [`807ab931`](https://github.com/cloudflare/workers-sdk/commit/807ab9316f1ce984f76302c9d9d5627c81617262) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: bump `miniflare` to [`3.20231002.1`](https://github.com/cloudflare/miniflare/releases/tag/v3.20231002.1)

- [#3726](https://github.com/cloudflare/workers-sdk/pull/3726) [`7d20bdbd`](https://github.com/cloudflare/workers-sdk/commit/7d20bdbd4ed7c5003b327a58af8d5c402df9fe2b) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: allow `__STATIC_CONTENT_MANIFEST` module to be imported anywhere

  `__STATIC_CONTENT_MANIFEST` can now be imported in subdirectories when
  `--no-bundle` or `find_additional_modules` are enabled.

* [#3926](https://github.com/cloudflare/workers-sdk/pull/3926) [`f585f695`](https://github.com/cloudflare/workers-sdk/commit/f585f6954eb2ebb1d1e3ee4bee11f7757b25a925) Thanks [@penalosa](https://github.com/penalosa)! - Log more detail about tokens after authentication errors

- [#3695](https://github.com/cloudflare/workers-sdk/pull/3695) [`1d0b7ad5`](https://github.com/cloudflare/workers-sdk/commit/1d0b7ad5512d0cd43c6e137f5bf5caa93c6319d5) Thanks [@JacksonKearl](https://github.com/JacksonKearl)! - Fixed `pages dev` crashing and leaving port open when building a worker script fails

* [#4066](https://github.com/cloudflare/workers-sdk/pull/4066) [`c8b4a07f`](https://github.com/cloudflare/workers-sdk/commit/c8b4a07f2e799df44da70cb1eaeb2a7480e0af7a) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: we no longer infer pathnames from route patterns as the host

  During local development, inside your worker, the host of `request.url` is inferred from the `routes` in your config.

  Previously, route patterns like "\*/some/path/name" would infer the host as "some". We now handle this case and determine we cannot infer a host from such patterns.

## 3.10.1

### Patch Changes

- [#4041](https://github.com/cloudflare/workers-sdk/pull/4041) [`6b1c327d`](https://github.com/cloudflare/workers-sdk/commit/6b1c327d00befb6d95a88f4451547457b1927dd4) Thanks [@elithrar](https://github.com/elithrar)! - Fixed a bug in Vectorize that send preset configurations with the wrong key. This was patched on the server-side to work around this for users in the meantime.

* [#4054](https://github.com/cloudflare/workers-sdk/pull/4054) [`f8c52b93`](https://github.com/cloudflare/workers-sdk/commit/f8c52b938dd6a7ccf25fa54bd73e8f6206808ad4) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: allow `wrangler pages dev` sessions to be reloaded

  Previously, `wrangler pages dev` attempted to send messages on a closed IPC
  channel when sources changed, resulting in an `ERR_IPC_CHANNEL_CLOSED` error.
  This change ensures the channel stays open until the user exits `wrangler pages dev`.

## 3.10.0

### Minor Changes

- [#4013](https://github.com/cloudflare/workers-sdk/pull/4013) [`3cd72862`](https://github.com/cloudflare/workers-sdk/commit/3cd72862b7c9f6d30468320866badd586cd242ce) Thanks [@elithrar](https://github.com/elithrar)! - Adds wrangler support for Vectorize, Cloudflare's new vector database, with
  `wrangler vectorize`. Visit the developer documentation
  (https://developers.cloudflare.com/vectorize/) to learn more and create your
  first vector database with `wrangler vectorize create my-first-index`.

* [#3999](https://github.com/cloudflare/workers-sdk/pull/3999) [`ee6f3458`](https://github.com/cloudflare/workers-sdk/commit/ee6f345838d09af0de787c820a7fa2cdc76f58e7) Thanks [@OilyLime](https://github.com/OilyLime)! - Adds support for Hyperdrive, via `wrangler hyperdrive`.

### Patch Changes

- [#4034](https://github.com/cloudflare/workers-sdk/pull/4034) [`bde9d64a`](https://github.com/cloudflare/workers-sdk/commit/bde9d64a6b13d49063cc7fe25d37606b0810dd83) Thanks [@ndisidore](https://github.com/ndisidore)! - Adds Vectorize support uploading batches of newline delimited json (ndjson)
  vectors from a source file.
  Load a dataset with `vectorize insert my-index --file vectors.ndjson`

* [#4028](https://github.com/cloudflare/workers-sdk/pull/4028) [`d5389731`](https://github.com/cloudflare/workers-sdk/commit/d538973179966f742edd48958bf311764f715bda) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: Bulk Secret Draft Worker

  Fixes the issue of a upload of a Secret when a Worker doesn't exist yet, the draft worker is created and the secret is uploaded to it.

  Fixes https://github.com/cloudflare/wrangler-action/issues/162

## 3.9.1

### Patch Changes

- [#3992](https://github.com/cloudflare/workers-sdk/pull/3992) [`35564741`](https://github.com/cloudflare/workers-sdk/commit/3556474116db2fc7dbfbb34bfc351490360f4d85) Thanks [@edevil](https://github.com/edevil)! - Add AI binding that will be used to interact with the AI project.

  Example `wrangler.toml`

      name = "ai-worker"
      main = "src/index.ts"

      [ai]
      binding = "AI"

  Example script:

      import Ai from "@cloudflare/ai"

      export default {
          async fetch(request: Request, env: Env): Promise<Response> {
              const ai = new Ai(env.AI);

              const story = await ai.run({
                  model: 'llama-2',
                  input: {
                      prompt: 'Tell me a story about the future of the Cloudflare dev platform'
                  }
              });

          return new Response(JSON.stringify(story));
          },
      };

      export interface Env {
          AI: any;
      }

* [#4006](https://github.com/cloudflare/workers-sdk/pull/4006) [`bc8c147a`](https://github.com/cloudflare/workers-sdk/commit/bc8c147a9118748bb3b5eb220af5699f8b2f7899) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: remove warning around using D1's binding, and clean up the epilogue when running D1 commands

- [#4027](https://github.com/cloudflare/workers-sdk/pull/4027) [`9e466599`](https://github.com/cloudflare/workers-sdk/commit/9e466599210902515ece6f5ea07fbabcd8fdac6a) Thanks [@jspspike](https://github.com/jspspike)! - Add WebGPU support through miniflare update

* [#3986](https://github.com/cloudflare/workers-sdk/pull/3986) [`00247a8d`](https://github.com/cloudflare/workers-sdk/commit/00247a8d69613a4cfeb621b5cca075828e5ae1e1) Thanks [@edevil](https://github.com/edevil)! - Added AI related CLI commands

## 3.9.0

### Minor Changes

- [#3951](https://github.com/cloudflare/workers-sdk/pull/3951) [`e0850ad1`](https://github.com/cloudflare/workers-sdk/commit/e0850ad1ebfbb775a78339136e3a2c571d80e566) Thanks [@mrbbot](https://github.com/mrbbot)! - feat: add support for breakpoint debugging to `wrangler dev`'s `--remote` and `--no-bundle` modes

  Previously, breakpoint debugging using Wrangler's DevTools was only supported
  in local mode, when using Wrangler's built-in bundler. This change extends that
  to remote development, and `--no-bundle`.

  When using `--remote` and `--no-bundle` together, uncaught errors will now be
  source-mapped when logged too.

* [#3951](https://github.com/cloudflare/workers-sdk/pull/3951) [`e0850ad1`](https://github.com/cloudflare/workers-sdk/commit/e0850ad1ebfbb775a78339136e3a2c571d80e566) Thanks [@mrbbot](https://github.com/mrbbot)! - feat: add support for Visual Studio Code's built-in breakpoint debugger

  Wrangler now supports breakpoint debugging with Visual Studio Code's debugger.
  Create a `.vscode/launch.json` file with the following contents...

  ```json
  {
  	"configurations": [
  		{
  			"name": "Wrangler",
  			"type": "node",
  			"request": "attach",
  			"port": 9229,
  			"cwd": "/",
  			"resolveSourceMapLocations": null,
  			"attachExistingChildren": false,
  			"autoAttachChildProcesses": false
  		}
  	]
  }
  ```

  ...then run `wrangler dev`, and launch the configuration.

### Patch Changes

- [#3954](https://github.com/cloudflare/workers-sdk/pull/3954) [`bc88f0ec`](https://github.com/cloudflare/workers-sdk/commit/bc88f0ec0f46bcf4f8204239ff7e14aa3fe11990) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - update `wrangler pages dev` D1 and DO descriptions

* [#3928](https://github.com/cloudflare/workers-sdk/pull/3928) [`95b24b1e`](https://github.com/cloudflare/workers-sdk/commit/95b24b1eb986fb73a2b87c5a0eecc32a607e7331) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - Colorize Deployed Bundle Size
  Most bundlers, and other tooling that give you size outputs will colorize their the text to indicate if the value is within certain ranges.
  The current range values are:
  red 100% - 90%
  yellow 89% - 70%
  green <70%

  resolves #1312

## 3.8.0

### Minor Changes

- [#3775](https://github.com/cloudflare/workers-sdk/pull/3775) [`3af30879`](https://github.com/cloudflare/workers-sdk/commit/3af3087954e2d1580c3c3b6ac9d63c0737f4ba2a) Thanks [@bthwaites](https://github.com/bthwaites)! - R2 Jurisdictional Restrictions guarantee objects in a bucket are stored within a specific jurisdiction. Wrangler now allows you to interact with buckets in a defined jurisdiction.

  Wrangler R2 operations now support a `-J` flag that allows the user to specify a jurisdiction. When passing the `-J` flag, you will only be able to interact with R2 resources within that jurisdiction.

  ```bash
  # List all of the buckets in the EU jurisdiction
  wrangler r2 bucket list -J eu
  # Downloads the object 'myfile.txt' from the bucket 'mybucket' in EU jurisdiction
  wrangler r2 object get mybucket/myfile.txt -J eu
  ```

  To access R2 buckets that belong to a jurisdiction from Workers, you will need to specify the jurisdiction as well as the bucket name as part of your bindings in your `wrangler.toml`:

  ```toml
  [[r2_buckets]]
  bindings = [
    { binding = "MY_BUCKET", bucket_name = "<YOUR_BUCKET_NAME>", jurisdiction = "<JURISDICTION>" }
  ]
  ```

### Patch Changes

- [#3901](https://github.com/cloudflare/workers-sdk/pull/3901) [`a986f19f`](https://github.com/cloudflare/workers-sdk/commit/a986f19f2d7989639524f9fd73761ea69aef4f6b) Thanks [@DaniFoldi](https://github.com/DaniFoldi)! - Only require preview_id and preview_bucket_name in remote dev mode

* [#3912](https://github.com/cloudflare/workers-sdk/pull/3912) [`0ba58841`](https://github.com/cloudflare/workers-sdk/commit/0ba588414e595d946c28c971bae7ef77e6e85050) Thanks [@jspspike](https://github.com/jspspike)! - Ignore cached account id when `CLOUDFLARE_ACCOUNT_ID` is specified

## 3.7.0

### Minor Changes

- [#3772](https://github.com/cloudflare/workers-sdk/pull/3772) [`a3b3765d`](https://github.com/cloudflare/workers-sdk/commit/a3b3765d9fe4d6e62aa31bb02b682998f1cb7276) Thanks [@jspspike](https://github.com/jspspike)! - Bump esbuild version to 0.17.19. Breaking changes to esbuild are documented [here](https://github.com/evanw/esbuild/releases/tag/v0.17.0)

* [#3895](https://github.com/cloudflare/workers-sdk/pull/3895) [`40f56562`](https://github.com/cloudflare/workers-sdk/commit/40f565628aaef2cad745aeeb4da297e7a6973e0d) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: bump `miniflare` to [`3.20230904.0`](https://github.com/cloudflare/miniflare/releases/tag/v3.20230904.0)

- [#3774](https://github.com/cloudflare/workers-sdk/pull/3774) [`ae2d5cb5`](https://github.com/cloudflare/workers-sdk/commit/ae2d5cb52ee249d19ec94f9acbd77aa262eeb391) Thanks [@mrbbot](https://github.com/mrbbot)! - feat: support breakpoint debugging in local mode

  `wrangler dev` now supports breakpoint debugging in local mode! Press `d` to open DevTools and set breakpoints.

## 3.6.0

### Minor Changes

- [#3727](https://github.com/cloudflare/workers-sdk/pull/3727) [`a5e7c0be`](https://github.com/cloudflare/workers-sdk/commit/a5e7c0be0f1b095f9af3d2b55782f9d8b2a6bb09) Thanks [@echen67](https://github.com/echen67)! - Warn user when the last deployment was via the API

### Patch Changes

- [#3762](https://github.com/cloudflare/workers-sdk/pull/3762) [`18dc7b54`](https://github.com/cloudflare/workers-sdk/commit/18dc7b5428ffb5c68dc5ebbbaf506d8fc2fe1f48) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Add internal `wrangler pages project validate [directory]` command which validates an asset directory

* [#3758](https://github.com/cloudflare/workers-sdk/pull/3758) [`0adccc71`](https://github.com/cloudflare/workers-sdk/commit/0adccc71789efe1b42b6d3de55f6d6d7e50fda64) Thanks [@jahands](https://github.com/jahands)! - fix: Retry deployment errors in wrangler pages publish

  This will improve reliability when deploying to Cloudflare Pages

## 3.5.1

### Patch Changes

- [#3752](https://github.com/cloudflare/workers-sdk/pull/3752) [`8f5ed7fe`](https://github.com/cloudflare/workers-sdk/commit/8f5ed7febc1b348f3fc88eabccabd9678b6cd21a) Thanks [@DaniFoldi](https://github.com/DaniFoldi)! - Changed the binding type of WfP Dispatch Namespaces to `DispatchNamespace`

* [#3765](https://github.com/cloudflare/workers-sdk/pull/3765) [`e17d3096`](https://github.com/cloudflare/workers-sdk/commit/e17d3096ecde7cf697f7d5bc6ebc3a868eb88cfa) Thanks [@RamIdeas](https://github.com/RamIdeas)! - bump miniflare version to 3.20230814.1

## 3.5.0

### Minor Changes

- [#3703](https://github.com/cloudflare/workers-sdk/pull/3703) [`e600f029`](https://github.com/cloudflare/workers-sdk/commit/e600f0298d4d2780bdfc1171a5f84a5f36ce5010) Thanks [@jspspike](https://github.com/jspspike)! - Added --local option for r2 commands to interact with local persisted r2 objects

* [#3704](https://github.com/cloudflare/workers-sdk/pull/3704) [`8e231afd`](https://github.com/cloudflare/workers-sdk/commit/8e231afde850f353694478a5994e6ddee6df67b1) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - secret:bulk exit 1 on failure
  Previously `secret"bulk` would only log an error on failure of any of the upload requests.
  Now when 'secret:bulk' has an upload request fail it throws an Error which sends an `process.exit(1)` at the root `.catch()` signal.
  This will enable error handling in programmatic uses of `secret:bulk`.

- [#3684](https://github.com/cloudflare/workers-sdk/pull/3684) [`ff8603b6`](https://github.com/cloudflare/workers-sdk/commit/ff8603b6e1320d5c136712b8100e86c552eade46) Thanks [@jspspike](https://github.com/jspspike)! - Added --local option for kv commands to interact with local persisted kv entries

* [#3595](https://github.com/cloudflare/workers-sdk/pull/3595) [`c302bec6`](https://github.com/cloudflare/workers-sdk/commit/c302bec639c0eec10d07d6b950c0a2d3e16eab1e) Thanks [@geelen](https://github.com/geelen)! - Removing the D1 shim from the build process, in preparation for the Open Beta. D1 can now be used with --no-bundle enabled.

- [#3707](https://github.com/cloudflare/workers-sdk/pull/3707) [`6de3c5ec`](https://github.com/cloudflare/workers-sdk/commit/6de3c5eced6f31a2a55f4c043e1025f4f4733ad0) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Added handling of .mjs files to be picked up by inside the Pages \_worker.js directory
  (currently only .js files are)

### Patch Changes

- [#3693](https://github.com/cloudflare/workers-sdk/pull/3693) [`8f257126`](https://github.com/cloudflare/workers-sdk/commit/8f2571260f10660b9494332b681608b6051a7d52) Thanks [@RamIdeas](https://github.com/RamIdeas)! - Bump the version of miniflare to 3.20230801.0

## 3.4.0

### Minor Changes

- [#3649](https://github.com/cloudflare/workers-sdk/pull/3649) [`e2234bbc`](https://github.com/cloudflare/workers-sdk/commit/e2234bbc2fc06c201dd5f256357084c86789891c) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - Feature: 'stdin' support for 'secret:bulk'
  Added functionality that allows for files and strings to be piped in, or other means of standard input. This will allow for a broader variety of use cases and improved DX.
  This implementation is also fully backward compatible with the previous input method of file path to JSON.

  ```bash
  # Example of piping in a file
  > cat ./my-file.json | wrangler secret:bulk

  # Example of piping in a string
  > echo '{"key":"value"}' | wrangler secret:bulk

  # Example of redirecting input from a file
  > wrangler secret:bulk < ./my-file.json
  ```

* [#3675](https://github.com/cloudflare/workers-sdk/pull/3675) [`f753f3af`](https://github.com/cloudflare/workers-sdk/commit/f753f3afb7478bb289b39c44b33acbcefe06e99a) Thanks [@1000hz](https://github.com/1000hz)! - chore: upgrade `miniflare` to [`3.20230724.0`](https://github.com/cloudflare/miniflare/releases/tag/v3.20230724.0)

### Patch Changes

- [#3610](https://github.com/cloudflare/workers-sdk/pull/3610) [`bfbe49d0`](https://github.com/cloudflare/workers-sdk/commit/bfbe49d0d147ab8e32944ade524bc85f7f6f0cf3) Thanks [@Skye-31](https://github.com/Skye-31)! - Wrangler Capnp Compilation

  This PR replaces logfwdr's `schema` property with a new `unsafe.capnp` object. This object accepts either a `compiled_schema` property, or a `base_path` and array of `source_schemas` to get Wrangler to compile the capnp schema for you.

* [#3579](https://github.com/cloudflare/workers-sdk/pull/3579) [`d4450b0a`](https://github.com/cloudflare/workers-sdk/commit/d4450b0a095c3b31fdc09a7af2e3336048c7be70) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: remove --experimental-backend from `wrangler d1 migrations apply`

  This PR removes the need to pass a `--experimental-backend` flag when running migrations against an experimental D1 db.

  Closes #3596

- [#3623](https://github.com/cloudflare/workers-sdk/pull/3623) [`99baf58b`](https://github.com/cloudflare/workers-sdk/commit/99baf58b7c35e85c90e1f6df4cea841f31c0a709) Thanks [@RamIdeas](https://github.com/RamIdeas)! - when running `wrangler init -y ...`, the `-y` flag is now passed to npx when delegating to C3

* [#3668](https://github.com/cloudflare/workers-sdk/pull/3668) [`99032c1e`](https://github.com/cloudflare/workers-sdk/commit/99032c1e500132e16f0c1027cb4cba0c59823656) Thanks [@rozenmd](https://github.com/rozenmd)! - chore: make D1's experimental backend the default

  This PR makes D1's experimental backend turned on by default.

- [#3579](https://github.com/cloudflare/workers-sdk/pull/3579) [`d4450b0a`](https://github.com/cloudflare/workers-sdk/commit/d4450b0a095c3b31fdc09a7af2e3336048c7be70) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: implement time travel for experimental d1 dbs

  This PR adds two commands under `wrangler d1 time-travel`:

  ```
  Use Time Travel to restore, fork or copy a database at a specific point-in-time.

  Commands:

  wrangler d1 time-travel info <database>     Retrieve information about a database at a specific point-in-time using Time Travel.
  Options:
        --timestamp  accepts a Unix (seconds from epoch) or RFC3339 timestamp (e.g. 2023-07-13T08:46:42.228Z) to retrieve a bookmark for  [string]
        --json       return output as clean JSON  [boolean] [default: false]

  wrangler d1 time-travel restore <database>  Restore a database back to a specific point-in-time.
  Options:
        --bookmark   Bookmark to use for time travel  [string]
        --timestamp  accepts a Unix (seconds from epoch) or RFC3339 timestamp (e.g. 2023-07-13T08:46:42.228Z) to retrieve a bookmark for  [string]
        --json       return output as clean JSON  [boolean] [default: false]
  ```

  Closes #3577

* [#3592](https://github.com/cloudflare/workers-sdk/pull/3592) [`89cd086b`](https://github.com/cloudflare/workers-sdk/commit/89cd086ba0429651a30e8287c1e9e660d2fef6d0) Thanks [@penalosa](https://github.com/penalosa)! - fix: Only log dev registry connection errors once

- [#3384](https://github.com/cloudflare/workers-sdk/pull/3384) [`ccc19d57`](https://github.com/cloudflare/workers-sdk/commit/ccc19d57e0b6a557c39bedbbb92ec4e52c580975) Thanks [@Peter-Sparksuite](https://github.com/Peter-Sparksuite)! - feature: add wrangler deploy option: --old-asset-ttl [seconds]

  `wrangler deploy` immediately deletes assets that are no longer current, which has a side-effect for existing progressive web app users of seeing 404 errors as the app tries to access assets that no longer exist.

  This new feature:

  - does not change the default behavior of immediately deleting no-longer needed assets.
  - allows users to opt-in to expiring newly obsoleted assets after the provided number of seconds hence, so that current users will have a time buffer before seeing 404 errors.
  - is similar in concept to what was introduced in Wrangler 1.x with https://github.com/cloudflare/wrangler-legacy/pull/2221.
  - is careful to avoid extension of existing expiration targets on already expiring old assets, which may have contributed to unexpectedly large KV storage accumulations (perhaps why, in Wrangler 1.x, the reversion https://github.com/cloudflare/wrangler-legacy/pull/2228 happened).
  - no breaking changes for users relying on the default behavior, but some output changes exist when the new option is used, to indicate the change in behavior.

* [#3678](https://github.com/cloudflare/workers-sdk/pull/3678) [`17780b27`](https://github.com/cloudflare/workers-sdk/commit/17780b279998db00732406633958dc35eecaa70f) Thanks [@1000hz](https://github.com/1000hz)! - Refined the type of `CfVars` from `Record<string, unknown>` to `Record<string, string | Json>`

## 3.3.0

### Minor Changes

- [#3628](https://github.com/cloudflare/workers-sdk/pull/3628) [`e72a5794`](https://github.com/cloudflare/workers-sdk/commit/e72a5794f219e21ede701a7184a4691058366753) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: upgrade `miniflare` to [`3.20230717.0`](https://github.com/cloudflare/miniflare/releases/tag/v3.20230717.0)

### Patch Changes

- [#3587](https://github.com/cloudflare/workers-sdk/pull/3587) [`30f114af`](https://github.com/cloudflare/workers-sdk/commit/30f114afcdae8c794364a89ad8b7a7c92fce3524) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: keep configuration watcher alive

  Ensure `wrangler dev` watches the `wrangler.toml` file and reloads the server whenever configuration (e.g. KV namespaces, compatibility dates, etc) changes.

* [#3588](https://github.com/cloudflare/workers-sdk/pull/3588) [`64631d8b`](https://github.com/cloudflare/workers-sdk/commit/64631d8b59572f49d65325d8f6fec098c5e912b9) Thanks [@penalosa](https://github.com/penalosa)! - fix: Preserve email handlers when applying middleware to user workers.

## 3.2.0

### Minor Changes

- [#3583](https://github.com/cloudflare/workers-sdk/pull/3583) [`78ddb8de`](https://github.com/cloudflare/workers-sdk/commit/78ddb8de78152b2cb4180f23b51ee5478637d92d) Thanks [@penalosa](https://github.com/penalosa)! - Upgrade Miniflare (and hence `workerd`) to `v3.20230710.0`.

* [#3426](https://github.com/cloudflare/workers-sdk/pull/3426) [`5a74cb55`](https://github.com/cloudflare/workers-sdk/commit/5a74cb559611b1035fe97ebbe870d7061f3b41d0) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - Prefer non-force deletes unless a Worker is a dependency of another.

  If a Worker is used as a service binding, a durable object namespace, an outbounds for a dynamic dispatch namespace, or a tail consumer, then deleting that Worker will break those existing ones that depend upon it. Deleting with ?force=true allows you to delete anyway, which is currently the default in Wrangler.

  Force deletes are not often necessary, however, and using it as the default has unfortunate consequences in the API. To avoid them, we check if any of those conditions exist, and present the information to the user. If they explicitly acknowledge they're ok with breaking their other Workers, fine, we let them do it. Otherwise, we'll always use the much safer non-force deletes. We also add a "--force" flag to the delete command to skip the checks and confirmation and proceed with ?force=true

### Patch Changes

- [#3585](https://github.com/cloudflare/workers-sdk/pull/3585) [`e33bb44a`](https://github.com/cloudflare/workers-sdk/commit/e33bb44a6a5a243db08835a965bf4918824d4fb7) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: register middleware once for module workers

  Ensure middleware is only registered on the first request when using module workers.
  This should prevent stack overflows and slowdowns when making large number of requests to `wrangler dev` with infrequent reloads.

* [#3547](https://github.com/cloudflare/workers-sdk/pull/3547) [`e16d0272`](https://github.com/cloudflare/workers-sdk/commit/e16d0272986f3e0c8a5ba908127dc93cf8c670bc) Thanks [@jspspike](https://github.com/jspspike)! - Fixed issue with wrangler dev not finding imported files. Previously when wrangler dev would automatically reload on any file changes, it would fail to find any imported files.

## 3.1.2

### Patch Changes

- [#3529](https://github.com/cloudflare/workers-sdk/pull/3529) [`bcdc1fe5`](https://github.com/cloudflare/workers-sdk/commit/bcdc1fe5684f325c86ff0f2c57af781ecba5b621) Thanks [@jspspike](https://github.com/jspspike)! - Support https in wrangler dev local mode

* [#3541](https://github.com/cloudflare/workers-sdk/pull/3541) [`09f317d4`](https://github.com/cloudflare/workers-sdk/commit/09f317d4c42d1787bdc636f13b4a303fa9a5b4b0) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Bump miniflare@3.0.2

- [#3497](https://github.com/cloudflare/workers-sdk/pull/3497) [`c5f3bf45`](https://github.com/cloudflare/workers-sdk/commit/c5f3bf45c0b7dd632ce63d0c4df846a2b8695021) Thanks [@evanderkoogh](https://github.com/evanderkoogh)! - Refactor dev-only checkedFetch check from a method substitution to a JavaScript Proxy to be able to support Proxied global fetch function.

* [#3403](https://github.com/cloudflare/workers-sdk/pull/3403) [`8d1521e9`](https://github.com/cloudflare/workers-sdk/commit/8d1521e9ce77136f6da6a1313748e597b3622f8b) Thanks [@Cherry](https://github.com/Cherry)! - fix: wrangler generate will now work cross-device. This is very common on Windows install that use C:/ for the OS and another drive for user files.

## 3.1.1

### Patch Changes

- [#3498](https://github.com/cloudflare/workers-sdk/pull/3498) [`fddffdf0`](https://github.com/cloudflare/workers-sdk/commit/fddffdf0c23d2ca56f2139a2c6bc278052594cba) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Prevent `wrangler pages dev` from serving asset files outside of the build output directory

* [#3431](https://github.com/cloudflare/workers-sdk/pull/3431) [`68ba49a8`](https://github.com/cloudflare/workers-sdk/commit/68ba49a8c5bde2e9847e9599d71b9a501866c54b) Thanks [@Cherry](https://github.com/Cherry)! - fix: allow context.data to be overriden in Pages Functions

- [#3414](https://github.com/cloudflare/workers-sdk/pull/3414) [`6b1870ad`](https://github.com/cloudflare/workers-sdk/commit/6b1870ad46eb8557a01fcfae0d3f948b804387a0) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: in D1, lift error.cause into the error message

  Prior to this PR, folks _had_ to console.log the `error.cause` property to understand why their D1 operations were failing. With this PR, `error.cause` will continue to work, but we'll also lift the cause into the error message.

* [#3483](https://github.com/cloudflare/workers-sdk/pull/3483) [`a9349a89`](https://github.com/cloudflare/workers-sdk/commit/a9349a89296dc98ac8fc52dbb013f298c9596d8f) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure that the script name is passed through to C3 from `wrangler init`

- [#3359](https://github.com/cloudflare/workers-sdk/pull/3359) [`5eef992f`](https://github.com/cloudflare/workers-sdk/commit/5eef992f2c9f71a4c9d5e0cc2820aad24b7ef382) Thanks [@RamIdeas](https://github.com/RamIdeas)! - `wrangler init ... -y` now delegates to C3 without prompts (respects the `-y` flag)

* [#3434](https://github.com/cloudflare/workers-sdk/pull/3434) [`4beac418`](https://github.com/cloudflare/workers-sdk/commit/4beac41818b89727cd991848a8c643d744bc1703) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: add the number of read queries and write queries in the last 24 hours to the `d1 info` command

- [#3454](https://github.com/cloudflare/workers-sdk/pull/3454) [`a2194043`](https://github.com/cloudflare/workers-sdk/commit/a2194043c6c755e9308b3ffc1e9afb0d1544f6b9) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: upgrade `miniflare` to `3.0.1`

  This version ensures root CA certificates are trusted on Windows.
  It also loads extra certificates from the `NODE_EXTRA_CA_CERTS` environment variable,
  allowing `wrangler dev` to be used with Cloudflare WARP enabled.

* [#3485](https://github.com/cloudflare/workers-sdk/pull/3485) [`e8df68ee`](https://github.com/cloudflare/workers-sdk/commit/e8df68eefede860f4217e3a398a0f3064f5cce38) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Allow setting a D1 database ID when using `wrangler pages dev` by providing an optional `=<ID>` suffix to the argument like `--d1 BINDING_NAME=database-id`

## 3.1.0

### Minor Changes

- [#3293](https://github.com/cloudflare/workers-sdk/pull/3293) [`4a88db32`](https://github.com/cloudflare/workers-sdk/commit/4a88db32c8962a55bbcad82048a858fbce3f8e93) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add `wrangler pages project delete` command

### Patch Changes

- [#3399](https://github.com/cloudflare/workers-sdk/pull/3399) [`d8a9995b`](https://github.com/cloudflare/workers-sdk/commit/d8a9995b3748893057b4cb657abd8f658b1f5875) Thanks [@Skye-31](https://github.com/Skye-31)! - Fix: wrangler pages dev --script-path argument when using a proxy command instead of directory mode

  Fixes a regression in wrangler@3.x, where `wrangler pages dev --script-path=<my script path> -- <proxy command>` would start throwing esbuild errors.

* [#3311](https://github.com/cloudflare/workers-sdk/pull/3311) [`116d3fd9`](https://github.com/cloudflare/workers-sdk/commit/116d3fd92fd4a2352202ebcb9b5c4e4c4f49c74b) Thanks [@Maximo-Guk](https://github.com/Maximo-Guk)! - Fix: Avoid unnecessary rebuilding pages functions in wrangler pages dev

- [#3314](https://github.com/cloudflare/workers-sdk/pull/3314) [`d5a230f1`](https://github.com/cloudflare/workers-sdk/commit/d5a230f1e74c1d8c619491291a6e2408cc8ec8d1) Thanks [@elithrar](https://github.com/elithrar)! - Fixed `wrangler d1 migrations` to use `--experimental-backend` and not `--experimentalBackend` so that it is consistent with `wrangler d1 create`.

* [#3373](https://github.com/cloudflare/workers-sdk/pull/3373) [`55703e52`](https://github.com/cloudflare/workers-sdk/commit/55703e52da35b15f5c11f9e3936cc5b1ad5836dc) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: wrangler rollback shouldn't print its warning in the global menu

- [#3124](https://github.com/cloudflare/workers-sdk/pull/3124) [`2956c31d`](https://github.com/cloudflare/workers-sdk/commit/2956c31d6c310e8fcfe6b68a0ace1f6e7bf7bf4c) Thanks [@verokarhu](https://github.com/verokarhu)! - fix: failed d1 migrations not treated as errors

  This PR teaches wrangler to return a non-success exit code when a set of migrations fails.

  It also cleans up `wrangler d1 migrations apply` output significantly, to only log information relevant to migrations.

* [#3390](https://github.com/cloudflare/workers-sdk/pull/3390) [`b5b46b4a`](https://github.com/cloudflare/workers-sdk/commit/b5b46b4a52a309d0b15d1424e35eaae2877c5cb9) Thanks [@shahsimpson](https://github.com/shahsimpson)! - Prevents uploads with both cron triggers and smart placement enabled

- [#3358](https://github.com/cloudflare/workers-sdk/pull/3358) [`27b5aec5`](https://github.com/cloudflare/workers-sdk/commit/27b5aec5484a4b4de4f49a73eec0535a8574c518) Thanks [@rozenmd](https://github.com/rozenmd)! - This PR implements a trimmer that removes BEGIN TRANSACTION/COMMIT from SQL files sent to the API (since the D1 API already wraps SQL in a transaction for users).

* [#3324](https://github.com/cloudflare/workers-sdk/pull/3324) [`ed9fbf79`](https://github.com/cloudflare/workers-sdk/commit/ed9fbf79988b694dc4fd8f2347d85b3f8aa19a4b) Thanks [@rozenmd](https://github.com/rozenmd)! - add `d1 info` command for people to check DB size

  This PR adds a `d1 info <NAME>` command for getting information about a D1 database, including the current database size and state.

  Usage:

  ```
  > npx wrangler d1 info northwind

  ┌───────────────────┬──────────────────────────────────────┐
  │                   │ d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06 │
  ├───────────────────┼──────────────────────────────────────┤
  │ name              │ northwind                            │
  ├───────────────────┼──────────────────────────────────────┤
  │ version           │ beta                                 │
  ├───────────────────┼──────────────────────────────────────┤
  │ num_tables        │ 13                                   │
  ├───────────────────┼──────────────────────────────────────┤
  │ file_size         │ 33.1 MB                              │
  ├───────────────────┼──────────────────────────────────────┤
  │ running_in_region │ WEUR                                 │
  └───────────────────┴──────────────────────────────────────┘
  ```

  ```
  > npx wrangler d1 info northwind --json
  {
    "uuid": "d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06",
    "name": "northwind",
    "version": "beta",
    "num_tables": 13,
    "file_size": 33067008,
    "running_in_region": "WEUR"
  }
  ```

- [#3317](https://github.com/cloudflare/workers-sdk/pull/3317) [`3dae2585`](https://github.com/cloudflare/workers-sdk/commit/3dae25857bc9674209db5d4997ac9ae691fd473e) Thanks [@jculvey](https://github.com/jculvey)! - Add the `--compatibility-flags` and `--compatibility-date` options to the `pages project create` command

## 3.0.1

### Patch Changes

- [#3277](https://github.com/cloudflare/workers-sdk/pull/3277) [`99e6ccf5`](https://github.com/cloudflare/workers-sdk/commit/99e6ccf504f66e4885cddf91b7a09d2e256b2d11) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: remove extraneous arg when wrangler delegates to c3

## 3.0.0

### Major Changes

- [#3197](https://github.com/cloudflare/workers-sdk/pull/3197) [`3b3fadfa`](https://github.com/cloudflare/workers-sdk/commit/3b3fadfa16009c6eac2f0aa747db8b06eb80a391) Thanks [@mrbbot](https://github.com/mrbbot)! - feature: rename `wrangler publish` to `wrangler deploy`

  This ensures consistency with other messaging, documentation and our dashboard,
  which all refer to deployments. This also avoids confusion with the similar but
  very different `npm publish` command. `wrangler publish` will remain a
  deprecated alias for now, but will be removed in the next major version of Wrangler.

* [#3197](https://github.com/cloudflare/workers-sdk/pull/3197) [`bac9b5de`](https://github.com/cloudflare/workers-sdk/commit/bac9b5de31210e57760ecaec599fe921a426f921) Thanks [@mrbbot](https://github.com/mrbbot)! - feature: enable local development with Miniflare 3 and `workerd` by default

  `wrangler dev` now runs fully-locally by default, using the open-source Cloudflare Workers runtime [`workerd`](https://github.com/cloudflare/workerd).
  To restore the previous behaviour of running on a remote machine with access to production data, use the new `--remote` flag.
  The `--local` and `--experimental-local` flags have been deprecated, as this behaviour is now the default, and will be removed in the next major version.

- [#3197](https://github.com/cloudflare/workers-sdk/pull/3197) [`02a672ed`](https://github.com/cloudflare/workers-sdk/commit/02a672ed39921a75f32d6d2665d5a0080a71e34f) Thanks [@mrbbot](https://github.com/mrbbot)! - feature: enable persistent storage in local mode by default

  Wrangler will now persist local KV, R2, D1, Cache and Durable Object data
  in the `.wrangler` folder, by default, between reloads. This persistence
  directory can be customised with the `--persist-to` flag. The `--persist` flag
  has been removed, as this is now the default behaviour.

* [#3197](https://github.com/cloudflare/workers-sdk/pull/3197) [`dc755fdc`](https://github.com/cloudflare/workers-sdk/commit/dc755fdc885a4e8d35338e65e7e54156499e4454) Thanks [@mrbbot](https://github.com/mrbbot)! - feature: remove delegation to locally installed versions

  Previously, if Wrangler was installed globally _and_ locally within a project,
  running the global Wrangler would instead invoke the local version.
  This behaviour was contrary to most other JavaScript CLI tools and has now been
  removed. We recommend you use `npx wrangler` instead, which will invoke the
  local version if installed, or install globally if not.

- [#3197](https://github.com/cloudflare/workers-sdk/pull/3197) [`24e1607a`](https://github.com/cloudflare/workers-sdk/commit/24e1607a5257d68da2beee90bbc61e8d04cf8742) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: remove unused files from published package

  Specifically, the `src` and `miniflare-config-stubs` directories have been removed.

### Minor Changes

- [#3200](https://github.com/cloudflare/workers-sdk/pull/3200) [`f1b8a1cc`](https://github.com/cloudflare/workers-sdk/commit/f1b8a1cccc47396047656cab540abdb4ec0be19a) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - Support outbounds for dispatch_namespace bindings

* [#3197](https://github.com/cloudflare/workers-sdk/pull/3197) [`b7c590b5`](https://github.com/cloudflare/workers-sdk/commit/b7c590b54e595fa5386762b9235bce625daade4e) Thanks [@mrbbot](https://github.com/mrbbot)! - feature: warn when a new major version is available

- [#3197](https://github.com/cloudflare/workers-sdk/pull/3197) [`e1e5d782`](https://github.com/cloudflare/workers-sdk/commit/e1e5d782c059dcd8343a6d2776a34f16e9d2b735) Thanks [@mrbbot](https://github.com/mrbbot)! - feature: add warning when trying to use `wrangler dev` inside a WebContainer

* [#3230](https://github.com/cloudflare/workers-sdk/pull/3230) [`41fc45c2`](https://github.com/cloudflare/workers-sdk/commit/41fc45c225f0d269a1bb06d89754a2a14ba7d517) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - Support tail_consumers in script upload

- [#3157](https://github.com/cloudflare/workers-sdk/pull/3157) [`4d7781f7`](https://github.com/cloudflare/workers-sdk/commit/4d7781f78ace94d3f627ba0b8ea7e5662a0cbe1f) Thanks [@edevil](https://github.com/edevil)! - [wrangler] feat: Support for Constellation bindings

  Added support for a new type of safe bindings called "Constellation"
  that allows interacting with uploaded models in the context of these
  projects.

  ```toml
  [[constellation]]
  binding = 'AI'
  project_id = '9d478427-dea6-4988-9b16-f6f8888d974c'
  ```

* [#3135](https://github.com/cloudflare/workers-sdk/pull/3135) [`cc2adc2e`](https://github.com/cloudflare/workers-sdk/commit/cc2adc2e8b28d1e38563bf72085d44e330563b08) Thanks [@edevil](https://github.com/edevil)! - [wrangler] feat: Support for Browser Workers

  These bindings allow one to use puppeteer to control a browser
  in a worker script.

- [#3150](https://github.com/cloudflare/workers-sdk/pull/3150) [`7512d4cc`](https://github.com/cloudflare/workers-sdk/commit/7512d4cc3cb3a0d3d6d766aeb1f912fdb8493d0b) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: upgrade `miniflare` to [`2.14.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.14.0)

### Patch Changes

- [#3175](https://github.com/cloudflare/workers-sdk/pull/3175) [`561b962f`](https://github.com/cloudflare/workers-sdk/commit/561b962f8e051ede6ce16ba189ab2088910e9cf4) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: `_worker.js/` directory support for dynamically imported chunks in `wrangler pages dev`

* [#3186](https://github.com/cloudflare/workers-sdk/pull/3186) [`3050ce7f`](https://github.com/cloudflare/workers-sdk/commit/3050ce7f9d28067c1a5e3189f42d7a9e335569cb) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure pages \_routes.json emulation in dev command handles .s and \*s

  Fixes #3184

- [#3048](https://github.com/cloudflare/workers-sdk/pull/3048) [`6ccc4fa6`](https://github.com/cloudflare/workers-sdk/commit/6ccc4fa672204ec671a1c99db04b4acbd52d5f20) Thanks [@oustn](https://github.com/oustn)! - Fix: fix local registry server closed

  Closes [#1920](https://github.com/cloudflare/workers-sdk/issues/1920). Sometimes start the local dev server will kill
  the devRegistry server so that the devRegistry server can't be used. We can listen the devRegistry server close event
  and reset server to `null`. When registerWorker is called, we can check if the server is `null` and start a new server.

* [#3001](https://github.com/cloudflare/workers-sdk/pull/3001) [`f9722873`](https://github.com/cloudflare/workers-sdk/commit/f9722873def41d21c3a90d9bb14747e76d2e01e1) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: make it possible to create a D1 database backed by the experimental backend, and make `d1 execute`'s batch size configurable

  With this PR, users will be able to run `wrangler d1 create <NAME> --experimental-backend` to create new D1 dbs that use an experimental backend. You can also run `wrangler d1 migrations apply <NAME> experimental-backend` to run migrations against an experimental database.

  On top of that, both `wrangler d1 migrations apply <NAME>` and `wrangler d1 execute <NAME>` now have a configurable `batch-size` flag, as the experimental backend can handle more than 10000 statements at a time.

- [#3153](https://github.com/cloudflare/workers-sdk/pull/3153) [`1b67a405`](https://github.com/cloudflare/workers-sdk/commit/1b67a405b7777efc401a44f59389ef00654b439d) Thanks [@edevil](https://github.com/edevil)! - [wrangler] fix: constellation command help

  Changed `name` to `projectName` in some Constellation commands that interacted with projects. Also added the possibility to specify a model description when uploading it.

* [#3214](https://github.com/cloudflare/workers-sdk/pull/3214) [`ce04aac0`](https://github.com/cloudflare/workers-sdk/commit/ce04aac04b473ad0074f0102bb15ebd4da42e55a) Thanks [@jspspike](https://github.com/jspspike)! - Add message for when `wrangler tail` exits sampling mode

- [#3168](https://github.com/cloudflare/workers-sdk/pull/3168) [`88ff9d7d`](https://github.com/cloudflare/workers-sdk/commit/88ff9d7d848a4f2bb0f836c3b2758434334d5144) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: (alpha) - make it possible to give D1 a hint on where it should create the database

* [#3175](https://github.com/cloudflare/workers-sdk/pull/3175) [`561b962f`](https://github.com/cloudflare/workers-sdk/commit/561b962f8e051ede6ce16ba189ab2088910e9cf4) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: `_worker.js/` directory support for D1 bindings

## 2.20.0

### Minor Changes

- [#2966](https://github.com/cloudflare/workers-sdk/pull/2966) [`e351afcf`](https://github.com/cloudflare/workers-sdk/commit/e351afcff4f265f85ff3e4674cc3083eb5cd5027) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Add support for the undocumented `_worker.js/` directory in Pages

* [#3095](https://github.com/cloudflare/workers-sdk/pull/3095) [`133c0423`](https://github.com/cloudflare/workers-sdk/commit/133c0423ccb4c2b35a1dd26157ce9a24c6a743bb) Thanks [@zebp](https://github.com/zebp)! - feat: add support for placement in wrangler config

  Allows a `placement` object in the wrangler config with a mode of `off` or `smart` to configure [Smart placement](https://developers.cloudflare.com/workers/platform/smart-placement/). Enabling Smart Placement can be done in your `wrangler.toml` like:

  ```toml
  [placement]
  mode = "smart"
  ```

- [#3140](https://github.com/cloudflare/workers-sdk/pull/3140) [`5fd080c8`](https://github.com/cloudflare/workers-sdk/commit/5fd080c88ee7991cde107f8723f06ea2fd2c651d) Thanks [@penalosa](https://github.com/penalosa)! - feat: Support sourcemaps in DevTools

  Intercept requests from DevTools in Wrangler to inject sourcemaps and enable folders in the Sources Panel of DevTools. When errors are thrown in your Worker, DevTools should now show your source file in the Sources panel, rather than Wrangler's bundled output.

### Patch Changes

- [#2912](https://github.com/cloudflare/workers-sdk/pull/2912) [`5079f476`](https://github.com/cloudflare/workers-sdk/commit/5079f4767f862cb7c42f4b2b5484b0391fbe5fae) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: do not render "value of stdout.lastframe() is undefined" if the output is an empty string

  Fixes #2907

* [#3133](https://github.com/cloudflare/workers-sdk/pull/3133) [`d0788008`](https://github.com/cloudflare/workers-sdk/commit/d078800804899c3c8e083260f8cfdfc0397d6110) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix pages building not taking into account the nodejs_compat flag (and improve the related error message)

- [#3146](https://github.com/cloudflare/workers-sdk/pull/3146) [`5b234cfd`](https://github.com/cloudflare/workers-sdk/commit/5b234cfd554aff08d065b96d7d49dfb36f40caa3) Thanks [@jspspike](https://github.com/jspspike)! - Added output for tail being in "sampling mode"

## 2.19.0

### Minor Changes

- [#3091](https://github.com/cloudflare/workers-sdk/pull/3091) [`c32f514c`](https://github.com/cloudflare/workers-sdk/commit/c32f514ca40e8b13dc9e86fdc76577b9adeb70f5) Thanks [@edevil](https://github.com/edevil)! - Added initial commands for integrating with Constellation AI.

## 2.18.0

### Minor Changes

- [#3098](https://github.com/cloudflare/workers-sdk/pull/3098) [`8818f551`](https://github.com/cloudflare/workers-sdk/commit/8818f5516ca909cc941deb953b6359030a8c0301) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: improve Workers Sites asset upload reliability

  - Wrangler no longer buffers all assets into memory before uploading. This should prevent out-of-memory errors when publishing sites with many large files.
  - Wrangler now limits the number of in-flight asset upload requests to 5, fixing the `Too many bulk operations already in progress` error.
  - Wrangler now correctly logs upload progress. Previously, the reported percentage was per upload request group, not across all assets.
  - Wrangler no longer logs all assets to the console by default. Instead, it will just log the first 100. The rest can be shown by setting the `WRANGLER_LOG=debug` environment variable. A splash of colour has also been added.

## 2.17.0

### Minor Changes

- [#3004](https://github.com/cloudflare/workers-sdk/pull/3004) [`6d5000a7`](https://github.com/cloudflare/workers-sdk/commit/6d5000a7b80b29eb57139c6334f40c564c9ad0c9) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: teach `wrangler docs` to use algolia search index

  This PR lets you search Cloudflare's entire docs via `wrangler docs [search term here]`.

  By default, if the search fails to find what you're looking for, you'll get an error like this:

  ```
  ✘ [ERROR] Could not find docs for: <search term goes here>. Please try again with another search term.
  ```

  If you provide the `--yes` or `-y` flag, wrangler will open the docs to https://developers.cloudflare.com/workers/wrangler/commands/, even if the search fails.

## 2.16.0

### Minor Changes

- [#3058](https://github.com/cloudflare/workers-sdk/pull/3058) [`1bd50f56`](https://github.com/cloudflare/workers-sdk/commit/1bd50f56a7215bb9a9480a8e8560862acef9e326) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: upgrade `miniflare@3` to [`3.0.0-next.13`](https://github.com/cloudflare/miniflare/releases/tag/v3.0.0-next.13)

  Notably, this adds native support for Windows to `wrangler dev --experimental-local`, logging for incoming requests, and support for a bunch of newer R2 features.

### Patch Changes

- [#3058](https://github.com/cloudflare/workers-sdk/pull/3058) [`1bd50f56`](https://github.com/cloudflare/workers-sdk/commit/1bd50f56a7215bb9a9480a8e8560862acef9e326) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: disable persistence without `--persist` in `--experimental-local`

  This ensures `--experimental-local` doesn't persist data on the file-system, unless the `--persist` flag is set.
  Data is still always persisted between reloads.

* [#3055](https://github.com/cloudflare/workers-sdk/pull/3055) [`5f48c405`](https://github.com/cloudflare/workers-sdk/commit/5f48c405c663de0c6b2bfc27005246f1fdec6987) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: Teach D1 commands to read auth configuration from wrangler.toml

  This PR fixes a bug in how D1 handles a user's accounts. We've updated the D1 commands to read from config (typically via wrangler.toml) before trying to run commands. This means if an `account_id` is defined in config, we'll use that instead of erroring out when there are multiple accounts to pick from.

  Fixes #3046

- [#3058](https://github.com/cloudflare/workers-sdk/pull/3058) [`1bd50f56`](https://github.com/cloudflare/workers-sdk/commit/1bd50f56a7215bb9a9480a8e8560862acef9e326) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: disable route validation when using `--experimental-local`

  This ensures `wrangler dev --experimental-local` doesn't require a login or an internet connection if a `route` is configured.

## 2.15.1

### Patch Changes

- [#2783](https://github.com/cloudflare/workers-sdk/pull/2783) [`4c55baf9`](https://github.com/cloudflare/workers-sdk/commit/4c55baf9cd0e3d8915272471476017e0d379a988) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Add `**/*.wasm?module` as default module rule (alias of `**/*.wasm`)

* [#2989](https://github.com/cloudflare/workers-sdk/pull/2989) [`86e942bb`](https://github.com/cloudflare/workers-sdk/commit/86e942bbb943750ee57e209a214e08926fb32ac5) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Durable Object proxying websockets over local dev registry

## 2.15.0

### Minor Changes

- [#2769](https://github.com/cloudflare/workers-sdk/pull/2769) [`0a779904`](https://github.com/cloudflare/workers-sdk/commit/0a77990457652af36c60c52bf9c38c3a69945de4) Thanks [@penalosa](https://github.com/penalosa)! - feature: Support modules with `--no-bundle`

  When the `--no-bundle` flag is set, Wrangler now has support for uploading additional modules alongside the entrypoint. This will allow modules to be imported at runtime on Cloudflare's Edge. This respects Wrangler's [module rules](https://developers.cloudflare.com/workers/wrangler/configuration/#bundling) configuration, which means that only imports of non-JS modules will trigger an upload by default. For instance, the following code will now work with `--no-bundle` (assuming the `example.wasm` file exists at the correct path):

  ```js
  // index.js
  import wasm from './example.wasm'

  export default {
    async fetch() {
      await WebAssembly.instantiate(wasm, ...)
      ...
    }
  }
  ```

  For JS modules, it's necessary to specify an additional [module rule](https://developers.cloudflare.com/workers/wrangler/configuration/#bundling) (or rules) in your `wrangler.toml` to configure your modules as ES modules or Common JS modules. For instance, to upload additional JavaScript files as ES modules, add the following module rule to your `wrangler.toml`, which tells Wrangler that all `**/*.js` files are ES modules.

  ```toml
  rules = [
    { type = "ESModule", globs = ["**/*.js"]},
  ]
  ```

  If you have Common JS modules, you'd configure Wrangler with a CommonJS rule (the following rule tells Wrangler that all `.cjs` files are Common JS modules):

  ```toml
  rules = [
    { type = "CommonJS", globs = ["**/*.cjs"]},
  ]
  ```

  In most projects, adding a single rule will be sufficient. However, for advanced usecases where you're mixing ES modules and Common JS modules, you'll need to use multiple rule definitions. For instance, the following set of rules will match all `.mjs` files as ES modules, all `.cjs` files as Common JS modules, and the `nested/say-hello.js` file as Common JS.

  ```toml
  rules = [
    { type = "CommonJS", globs = ["nested/say-hello.js", "**/*.cjs"]},
    { type = "ESModule", globs = ["**/*.mjs"]}
  ]
  ```

  If multiple rules overlap, Wrangler will log a warning about the duplicate rules, and will discard additional rules that matches a module. For example, the following rule configuration classifies `dep.js` as both a Common JS module and an ES module:

  ```toml
  rules = [
    { type = "CommonJS", globs = ["dep.js"]},
    { type = "ESModule", globs = ["dep.js"]}
  ]
  ```

  Wrangler will treat `dep.js` as a Common JS module, since that was the first rule that matched, and will log the following warning:

  ```
  ▲ [WARNING] Ignoring duplicate module: dep.js (esm)
  ```

  This also adds a new configuration option to `wrangler.toml`: `base_dir`. Defaulting to the directory of your Worker's main entrypoint, this tells Wrangler where your additional modules are located, and determines the module paths against which your module rule globs are matched.

  For instance, given the following directory structure:

  ```
  - wrangler.toml
  - src/
    - index.html
    - vendor/
      - dependency.js
    - js/
      - index.js
  ```

  If your `wrangler.toml` had `main = "src/js/index.js"`, you would need to set `base_dir = "src"` in order to be able to import `src/vendor/dependency.js` and `src/index.html` from `src/js/index.js`.

### Patch Changes

- [#2957](https://github.com/cloudflare/workers-sdk/pull/2957) [`084b2c58`](https://github.com/cloudflare/workers-sdk/commit/084b2c58ba051811afe4adf1518cab033ba62872) Thanks [@esimons](https://github.com/esimons)! - fix: Respect querystring params when calling `.fetch` on a worker instantiated with `unstable_dev`

  Previously, querystring params would be stripped, causing issues for test cases that depended on them. For example, given the following worker script:

  ```js
  export default {
  	fetch(req) {
  		const url = new URL(req.url);
  		const name = url.searchParams.get("name");
  		return new Response("Hello, " + name);
  	},
  };
  ```

  would fail the following test case:

  ```js
  const worker = await unstable_dev("script.js");
  const res = await worker.fetch("http://worker?name=Walshy");
  const text = await res.text();
  expect(text).toBe("Hello, Walshy");
  ```

* [#2840](https://github.com/cloudflare/workers-sdk/pull/2840) [`e311bbbf`](https://github.com/cloudflare/workers-sdk/commit/e311bbbf64343badd4bba7eb017b796a89eaf9fe) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: make `WRANGLER_LOG` case-insensitive, warn on unexpected values, and fallback to `log` if invalid

  Previously, levels set via the `WRANGLER_LOG` environment-variable were case-sensitive.
  If an unexpected level was set, Wrangler would fallback to `none`, hiding all logs.
  The fallback has now been switched to `log`, and lenient case-insensitive matching is used when setting the level.

- [#2044](https://github.com/cloudflare/workers-sdk/pull/2044) [`eebad0d9`](https://github.com/cloudflare/workers-sdk/commit/eebad0d9e593237b4db61047c94e2ec5b47a7b3c) Thanks [@kuba-orlik](https://github.com/kuba-orlik)! - fix: allow programmatic dev workers to be stopped and started in a single session

* [#2735](https://github.com/cloudflare/workers-sdk/pull/2735) [`3f7a75cc`](https://github.com/cloudflare/workers-sdk/commit/3f7a75ccc252567be3e9062ff0c6fd7e00201d0e) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - Fix: Generate Remote URL
  Previous URL was pointing to the old cloudflare/templates repo,
  updated the URL to point to templates in the workers-sdk monorepo.

## 2.14.0

### Minor Changes

- [#2942](https://github.com/cloudflare/workers-sdk/pull/2942) [`dc1465ea`](https://github.com/cloudflare/workers-sdk/commit/dc1465ea64acf3fc9c1442e7df73f14df7dc8630) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: upgrade `miniflare` to [`2.13.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.13.0)

* [#2914](https://github.com/cloudflare/workers-sdk/pull/2914) [`9af1a640`](https://github.com/cloudflare/workers-sdk/commit/9af1a640237ab26e6332e73e3656d16ca9a96e64) Thanks [@edevil](https://github.com/edevil)! - feat: add support for send email bindings

  Support send email bindings in order to send emails from a worker. There
  are three types of bindings:

  - Unrestricted: can send email to any verified destination address.
  - Restricted: can only send email to the supplied destination address (which
    does not need to be specified when sending the email but also needs to be a
    verified destination address).
  - Allowlist: can only send email to the supplied list of verified destination
    addresses.

### Patch Changes

- [#2931](https://github.com/cloudflare/workers-sdk/pull/2931) [`5f6c4c0c`](https://github.com/cloudflare/workers-sdk/commit/5f6c4c0c4542ada3552e1bf099ecdda677c08a3d) Thanks [@Skye-31](https://github.com/Skye-31)! - Fix: Pages Dev incorrectly allowing people to turn off local mode

  Local mode is not currently supported in Pages Dev, and errors when people attempt to use it. Previously, wrangler hid the "toggle local mode" button when using Pages dev, but this got broken somewhere along the line.

## 2.13.0

### Minor Changes

- [#2905](https://github.com/cloudflare/workers-sdk/pull/2905) [`6fd06241`](https://github.com/cloudflare/workers-sdk/commit/6fd062419c6b66c2c5beb7c45ec84a32dfa89e01) Thanks [@edevil](https://github.com/edevil)! - feat: support external imports from `cloudflare:...` prefixed modules

  Going forward Workers will be providing built-in modules (similar to `node:...`) that can be imported using the `cloudflare:...` prefix. This change adds support to the Wrangler bundler to mark these imports as external.

* [#2607](https://github.com/cloudflare/workers-sdk/pull/2607) [`163dccf4`](https://github.com/cloudflare/workers-sdk/commit/163dccf41453e1790fe8e5231d8c1cb8b6ef5a18) Thanks [@jspspike@gmail.com](https://github.com/jspspike@gmail.com)! - feature: add `wrangler deployment view` and `wrangler rollback` subcommands

`wrangler deployments view [deployment-id]` will get the details of a deployment, including bindings and usage model information.
This information can be used to help debug bad deployments.

`wrangler rollback [deployment-id]` will rollback to a specific deployment in the runtime. This will be useful in situations like recovering from a bad
deployment quickly while resolving issues. If a deployment id is not specified wrangler will rollback to the previous deployment. This rollback only changes the code in the runtime and doesn't affect any code or configurations
in a developer's local setup.

`wrangler deployments list` will list the 10 most recent deployments. This command originally existed as `wrangler deployments`

example of `view <deployment-id>` output:

```ts
Deployment ID: 07d7143d-0284-427e-ba22-2d5e6e91b479
Created on:    2023-03-02T21:05:15.622446Z
Author:        jspspike@gmail.com
Source:        Upload from Wrangler 🤠
------------------------------------------------------------
Author ID:          e5a3ca86e08fb0940d3a05691310bb42
Usage Model:        bundled
Handlers:           fetch
Compatibility Date: 2022-10-03
--------------------------bindings--------------------------
[[r2_buckets]]
binding = "MY_BUCKET"
bucket_name = "testr2"

[[kv_namespaces]]
id = "79300c6d17eb4180a07270f450efe53f"
binding = "yeee"
```

- [#2859](https://github.com/cloudflare/workers-sdk/pull/2859) [`ace46939`](https://github.com/cloudflare/workers-sdk/commit/ace46939ebfe43a446cac2f55c31a41fe3abb128) Thanks [@jbwcloudflare](https://github.com/jbwcloudflare)! - feature: add support for Queue Consumer concurrency

  Consumer concurrency allows a consumer Worker processing messages from a queue to automatically scale out horizontally in order to keep up with the rate that messages are being written to a queue.
  The new `max_concurrency` setting can be used to limit the maximum number of concurrent consumer Worker invocations.

### Patch Changes

- [#2838](https://github.com/cloudflare/workers-sdk/pull/2838) [`9fa6b167`](https://github.com/cloudflare/workers-sdk/commit/9fa6b16770586767324bbaa1ecccc587b7a19a77) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: display cause when local D1 migrations fail to apply

  Previously, if `wrangler d1 migrations apply --local` failed, you'd see something like:

  ```
  ❌ Migration 0000_migration.sql failed with following Errors
  ┌──────────┐
  │ Error    │
  ├──────────┤
  │ D1_ERROR │
  └──────────┘
  ```

  We'll now show the SQLite error that caused the failure:

  ```
  ❌ Migration 0000_migration.sql failed with following Errors
  ┌───────────────────────────────────────────────┐
  │ Error                                         │
  ├───────────────────────────────────────────────┤
  │ Error: SqliteError: unknown database "public" │
  └───────────────────────────────────────────────┘
  ```

* [#2902](https://github.com/cloudflare/workers-sdk/pull/2902) [`9996ac44`](https://github.com/cloudflare/workers-sdk/commit/9996ac44857ef9b4dd9fe545fcd9dbf7af3ecaf5) Thanks [@jspspike](https://github.com/jspspike)! - Fix issue with `keep_vars` having no effect in wrangler.toml

## 2.12.3

### Patch Changes

- [#2884](https://github.com/cloudflare/workers-sdk/pull/2884) [`e33bea9b`](https://github.com/cloudflare/workers-sdk/commit/e33bea9b2b3060c47bd7d453fdbb31889c52c45e) Thanks [@WalshyDev](https://github.com/WalshyDev)! - Changed console.debug for logger.debug in Pages uploading. This will ensure the debug logs are only sent when debug logging is enabled with `WRANGLER_LOG=debug`.

* [#2878](https://github.com/cloudflare/workers-sdk/pull/2878) [`6ebb23d5`](https://github.com/cloudflare/workers-sdk/commit/6ebb23d5b832a49a95b3a169ccf032a6260f22ef) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: Add D1 binding support to Email Workers

  This PR makes it possible to query D1 from an Email Worker, assuming a binding has been setup.

  As D1 is in alpha and not considered "production-ready", this changeset is a patch, rather than a minor bump to wrangler.

## 2.12.2

### Patch Changes

- [#2873](https://github.com/cloudflare/workers-sdk/pull/2873) [`5bcc333d`](https://github.com/cloudflare/workers-sdk/commit/5bcc333d2be77751c6e362ff3365c90ad60a0928) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Prevent compile loop when using `_worker.js` and `wrangler pages dev`

## 2.12.1

### Patch Changes

- [#2839](https://github.com/cloudflare/workers-sdk/pull/2839) [`ad4b123b`](https://github.com/cloudflare/workers-sdk/commit/ad4b123bb9fee51c0cca442e4d0ee6ebeeb020b1) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: remove `vitest` from `wrangler init`'s generated `tsconfig.json` `types` array

  Previously, `wrangler init` generated a `tsconfig.json` with `"types": ["@cloudflare/workers-types", "vitest"]`, even if Vitest tests weren't generated.
  Unlike Jest, Vitest [doesn't provide global APIs by default](https://vitest.dev/config/#globals), so there's no need for ambient types.

* [#2806](https://github.com/cloudflare/workers-sdk/pull/2806) [`8d462c0c`](https://github.com/cloudflare/workers-sdk/commit/8d462c0c6fb92dc503747d66565f7bb10bb937d0) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Remove the `--experimental-worker-bundle` option from Pages Functions

- [#2845](https://github.com/cloudflare/workers-sdk/pull/2845) [`e3c036d7`](https://github.com/cloudflare/workers-sdk/commit/e3c036d773ddc1e4498b016818a52a073909cf36) Thanks [@Cyb3r-Jak3](https://github.com/Cyb3r-Jak3)! - feature: include .wrangler directory in gitignore template used with `wrangler init`

* [#2806](https://github.com/cloudflare/workers-sdk/pull/2806) [`8d462c0c`](https://github.com/cloudflare/workers-sdk/commit/8d462c0c6fb92dc503747d66565f7bb10bb937d0) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Add `--outdir` as an option when running `wrangler pages functions build`.

  This deprecates `--outfile` when building a Pages Plugin with `--plugin`.

  When building functions normally, `--outdir` may be used to produce a human-inspectable format of the `_worker.bundle` that is produced.

- [#2806](https://github.com/cloudflare/workers-sdk/pull/2806) [`8d462c0c`](https://github.com/cloudflare/workers-sdk/commit/8d462c0c6fb92dc503747d66565f7bb10bb937d0) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Enable bundling in Pages Functions by default.

  We now enable bundling by default for a `functions/` folder and for an `_worker.js` in Pages Functions. This allows you to use external modules such as Wasm. You can disable this behavior in Direct Upload projects by using the `--no-bundle` argument in `wrangler pages publish` and `wrangler pages dev`.

* [#2836](https://github.com/cloudflare/workers-sdk/pull/2836) [`42fb97e5`](https://github.com/cloudflare/workers-sdk/commit/42fb97e5de4ed323a706c432b4ff9f73a2a8abbb) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: preserve the entrypoint filename when running `wrangler publish --outdir <dir>`.

  Previously, this entrypoint filename would sometimes be overwritten with some internal filenames. It should now be based off of the entrypoint you provide for your Worker.

- [#2828](https://github.com/cloudflare/workers-sdk/pull/2828) [`891ddf19`](https://github.com/cloudflare/workers-sdk/commit/891ddf19f4f9d268c52fb236f2195a7ff919601e) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Bring `pages dev` logging in line with `dev` proper's

  `wrangler pages dev` now defaults to logging at the `log` level (rather than the previous `warn` level), and the `pages` prefix is removed.

* [#2855](https://github.com/cloudflare/workers-sdk/pull/2855) [`226e63fa`](https://github.com/cloudflare/workers-sdk/commit/226e63fa3dc24153fb950fc9fb98d040ede30a13) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: `--experimental-local` with `wrangler pages dev`

  We previously had a bug which logged an error (`local worker: TypeError: generateASSETSBinding2 is not a function`). This has now been fixed.

- [#2831](https://github.com/cloudflare/workers-sdk/pull/2831) [`2b641765`](https://github.com/cloudflare/workers-sdk/commit/2b641765975d98e6e04342533fa088f51a96acab) Thanks [@Skye-31](https://github.com/Skye-31)! - Fix: Show correct link for how to create an API token in a non-interactive environment

## 2.12.0

### Minor Changes

- [#2810](https://github.com/cloudflare/workers-sdk/pull/2810) [`62784131`](https://github.com/cloudflare/workers-sdk/commit/62784131385d641c3512b09565d801a5ecd39725) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: upgrade `@miniflare/tre` to [`3.0.0-next.12`](https://github.com/cloudflare/miniflare/releases/tag/v3.0.0-next.12), incorporating changes from [`3.0.0-next.11`](https://github.com/cloudflare/miniflare/releases/tag/v3.0.0-next.11)

  Notably, this brings the following improvements to `wrangler dev --experimental-local`:

  - Adds support for Durable Objects and D1
  - Fixes an issue blocking clean exits and script reloads
  - Bumps to `better-sqlite3@8`, allowing installation on Node 19

* [#2665](https://github.com/cloudflare/workers-sdk/pull/2665) [`4756d6a1`](https://github.com/cloudflare/workers-sdk/commit/4756d6a143168da84548203b7b0bc23db0b92c95) Thanks [@alankemp](https://github.com/alankemp)! - Add new [unsafe.metadata] section to wrangler.toml allowing arbitary data to be added to the metadata section of the upload

### Patch Changes

- [#2539](https://github.com/cloudflare/workers-sdk/pull/2539) [`3725086c`](https://github.com/cloudflare/workers-sdk/commit/3725086c4b6854f6fb1e7e0517d3a526d0f9567b) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Add support for the `nodejs_compat` Compatibility Flag when bundling a Worker with Wrangler

  This new Compatibility Flag is incompatible with the legacy `--node-compat` CLI argument and `node_compat` configuration option. If you want to use the new runtime Node.js compatibility features, please remove the `--node-compat` argument from your CLI command or your config file.

## 2.11.1

### Patch Changes

- [#2795](https://github.com/cloudflare/workers-sdk/pull/2795) [`ec3e181e`](https://github.com/cloudflare/workers-sdk/commit/ec3e181eb91534ff79198847f7bf01a606fe2b4a) Thanks [@penalosa](https://github.com/penalosa)! - fix: Adds a `duplex: "half"` property to R2 fetch requests with stream bodies in order to be compatible with undici v5.20

* [#2789](https://github.com/cloudflare/workers-sdk/pull/2789) [`4ca8c0b0`](https://github.com/cloudflare/workers-sdk/commit/4ca8c0b02878ec259c6d48a47a2aa6e47f59bea0) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Support overriding the next URL in subsequent executions with `next("/new-path")` from within a Pages Plugin

## 2.11.0

### Minor Changes

- [#2651](https://github.com/cloudflare/workers-sdk/pull/2651) [`a9adfbe7`](https://github.com/cloudflare/workers-sdk/commit/a9adfbe7ea32d4a7c8121d7b34ce9ed51c826033) Thanks [@penalosa](https://github.com/penalosa)! - Previously, wrangler dev would not work if the root of your zone wasn't behind Cloudflare. This behaviour has changed so that now only the route which your Worker is exposed on has to be behind Cloudflare.

* [#2708](https://github.com/cloudflare/workers-sdk/pull/2708) [`b3346cfb`](https://github.com/cloudflare/workers-sdk/commit/b3346cfbecb2c20f7cce3c3bf8a585b7fd8811aa) Thanks [@Skye-31](https://github.com/Skye-31)! - Feat: Pages now supports Proxying (200 status) redirects in it's \_redirects file

  This will look something like the following, where a request to /users/123 will appear as that in the browser, but will internally go to /users/[id].html.

  ```
  /users/:id /users/[id] 200
  ```

### Patch Changes

- [#2766](https://github.com/cloudflare/workers-sdk/pull/2766) [`7912e63a`](https://github.com/cloudflare/workers-sdk/commit/7912e63aa15affc6e3d4a8cfe5dd54348c6e79ba) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: correctly detect `service-worker` format when using `typeof module`

  Wrangler automatically detects whether your code is a `modules` or `service-worker` format Worker based on the presence of a `default` `export`. This check currently works by building your entrypoint with `esbuild` and looking at the output metafile.

  Previously, we were passing `format: "esm"` to `esbuild` when performing this check, which enables _format conversion_. This may introduce `export default` into the built code, even if it wasn't there to start with, resulting in incorrect format detections.

  This change removes `format: "esm"` which disables format conversion when bundling is disabled. See https://esbuild.github.io/api/#format for more details.

* [#2780](https://github.com/cloudflare/workers-sdk/pull/2780) [`80f1187a`](https://github.com/cloudflare/workers-sdk/commit/80f1187a4f90764de53d7488d4e13ea73b748ced) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Ensure we don't mangle internal constructor names in the wrangler bundle when building with esbuild

  Undici changed how they referenced `FormData`, which meant that when used in our bundle process, we were failing to upload `multipart/form-data` bodies. This affected `wrangler pages publish` and `wrangler publish`.

- [#2720](https://github.com/cloudflare/workers-sdk/pull/2720) [`de0cb57a`](https://github.com/cloudflare/workers-sdk/commit/de0cb57a7a537e6a8554621451b3fd76ffb2e1d1) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - Fix: Upgraded to ES2022 for improved compatibility
  Upgraded worker code target version from ES2020 to ES2022 for better compatibility and unblocking of a workaround related to [issue #2029](https://github.com/cloudflare/workers-sdk/issues/2029). The worker runtime now uses the same V8 version as recent Chrome and is 99% ES2016+ compliant. The only thing we don't support on the Workers runtime, the remaining 1%, is the ES2022 RegEx feature as seen in the compat table for the latest Chrome version.

  Compatibility table: https://kangax.github.io/compat-table/es2016plus/

  [resolves #2716](https://github.com/cloudflare/workers-sdk/issues/2716)

* [#2771](https://github.com/cloudflare/workers-sdk/pull/2771) [`4ede044e`](https://github.com/cloudflare/workers-sdk/commit/4ede044e9247fdc689cbe537dcc5afbda71cf99c) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: upgrade `miniflare` to [`2.12.1`](https://github.com/cloudflare/miniflare/releases/tag/v2.12.1) and `@miniflare/tre` to [`3.0.0-next.10`](https://github.com/cloudflare/miniflare/releases/tag/v3.0.0-next.10)

## 2.10.0

### Minor Changes

- [#2567](https://github.com/cloudflare/workers-sdk/pull/2567) [`02ea098e`](https://github.com/cloudflare/workers-sdk/commit/02ea098ed2f0af58dc287a8f37819c96279235eb) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - Add mtls-certificate commands and binding support

  Functionality implemented first as an api, which is used in the cli standard
  api commands

  Note that this adds a new OAuth scope, so OAuth users will need to log out and
  log back in to use the new 'mtls-certificate' commands
  However, publishing with mtls-certifcate bindings (bindings of type
  'mtls_certificate') will work without the scope.

* [#2717](https://github.com/cloudflare/workers-sdk/pull/2717) [`c5943c9f`](https://github.com/cloudflare/workers-sdk/commit/c5943c9fe54e8bcf9ee1bf8ca992d2f8b84360a1) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to [`2.12.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.12.0), including support for R2 multipart upload bindings, the `nodejs_compat` compatibility flag, D1 fixes and more!

- [#2579](https://github.com/cloudflare/workers-sdk/pull/2579) [`bf558bdc`](https://github.com/cloudflare/workers-sdk/commit/bf558bdc6133acdffbfb08f6b8bd053bf1f25113) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - Added additional fields to the output of `wrangler deployments` command. The additional fields are from the new value in the response `annotations` which includes `workers/triggered_by` and `rollback_from`

  Example:

  ```
  Deployment ID: Galaxy-Class
  Created on:    2021-01-04T00:00:00.000000Z

  Trigger:       Upload from Wrangler 🤠
  Rollback from: MOCK-DEPLOYMENT-ID-2222
  ```

### Patch Changes

- [#2624](https://github.com/cloudflare/workers-sdk/pull/2624) [`882bf592`](https://github.com/cloudflare/workers-sdk/commit/882bf592fa3a16a8a020808f70ef936bc7f87209) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Add wasm support in `wrangler pages publish`

  Currently it is not possible to import `wasm` modules in either Pages
  Functions or Pages Advanced Mode projects.

  This commit caries out work to address the aforementioned issue by
  enabling `wasm` module imports in `wrangler pages publish`. As a result,
  Pages users can now import their `wasm` modules withing their Functions
  or `_worker.js` files, and `wrangler pages publish` will correctly
  bundle everything and serve these "external" modules.

* [#2683](https://github.com/cloudflare/workers-sdk/pull/2683) [`68a2a19e`](https://github.com/cloudflare/workers-sdk/commit/68a2a19ec962aeeb34059e1e98d088e021048739) Thanks [@mrbbot](https://github.com/mrbbot)! - Fix internal middleware system to allow D1 databases and `--test-scheduled` to be used together

- [#2609](https://github.com/cloudflare/workers-sdk/pull/2609) [`58ac8a78`](https://github.com/cloudflare/workers-sdk/commit/58ac8a783b95c2c884781e5c8af675fe8036644b) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make sure that the pages publish --no-bundle flag is correctly recognized

* [#2696](https://github.com/cloudflare/workers-sdk/pull/2696) [`4bc78470`](https://github.com/cloudflare/workers-sdk/commit/4bc784706193e24b7a92a19c0ac76eaa7ddcb1c6) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: don't throw an error when omitting preview_database_id, warn instead

- [#2715](https://github.com/cloudflare/workers-sdk/pull/2715) [`e33294b0`](https://github.com/cloudflare/workers-sdk/commit/e33294b07ced96707cad9d71feb768b4ac435f76) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: make it possible to run SQL against preview databases

* [#2685](https://github.com/cloudflare/workers-sdk/pull/2685) [`2b1177ad`](https://github.com/cloudflare/workers-sdk/commit/2b1177ad524b33a4364bc6bed58c3e0b4c59775e) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - You can now import Wasm modules in Pages Functions and Pages Functions Advanced Mode (`_worker.js`).
  This change specifically enables `wasm` module imports in `wrangler pages functions build`.
  As a result, Pages users can now import their `wasm` modules within their Functions or
  `_worker.js` files, and `wrangler pages functions build` will correctly bundle everything
  and output the expected result file.

## 2.9.1

### Patch Changes

- [#2652](https://github.com/cloudflare/wrangler2/pull/2652) [`2efd4537`](https://github.com/cloudflare/wrangler2/commit/2efd4537cb141e88fe9a674c2fd093b40a3c9d63) Thanks [@mrkldshv](https://github.com/mrkldshv)! - fix: change `jest` to `vitest` types in generated TypeScript config

* [#2657](https://github.com/cloudflare/wrangler2/pull/2657) [`8d21b2ea`](https://github.com/cloudflare/wrangler2/commit/8d21b2eae4ca5b3eb96c19cbb5c95b470e69942e) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: remove the need to login when running `d1 migrations list --local`

- [#2592](https://github.com/cloudflare/wrangler2/pull/2592) [`dd66618b`](https://github.com/cloudflare/wrangler2/commit/dd66618b2cc63a89424f471f6153be9518f1f087) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: bump esbuild to 0.16.3 (fixes a bug in esbuild's 0.15.13 release that would cause it to hang, is the latest release before a major breaking change that requires us to refactor)

## 2.9.0

### Minor Changes

- [#2629](https://github.com/cloudflare/workers-sdk/pull/2629) [`151733e5`](https://github.com/cloudflare/workers-sdk/commit/151733e5d98e95f363b548f9959c2baf418eb7b5) Thanks [@mrbbot](https://github.com/mrbbot)! - Prefer the `workerd` `exports` condition when bundling.

  This can be used to build isomorphic libraries that have different implementations depending on the JavaScript runtime they're running in.
  When bundling, Wrangler will try to load the [`workerd` key](https://runtime-keys.proposal.wintercg.org/#workerd).
  This is the [standard key](https://runtime-keys.proposal.wintercg.org/#workerd) for the Cloudflare Workers runtime.
  Learn more about the [conditional `exports` field here](https://nodejs.org/api/packages.html#conditional-exports).

### Patch Changes

- [#2409](https://github.com/cloudflare/workers-sdk/pull/2409) [`89d78c0a`](https://github.com/cloudflare/workers-sdk/commit/89d78c0ac444885298ac052b0b3de23b69fb029b) Thanks [@penalosa](https://github.com/penalosa)! - Wrangler now supports an `--experimental-json-config` flag which will read your configuration from a `wrangler.json` file, rather than `wrangler.toml`. The format of this file is exactly the same as the `wrangler.toml` configuration file, except that the syntax is `JSONC` (JSON with comments) rather than `TOML`. This is experimental, and is not recommended for production use.

* [#2623](https://github.com/cloudflare/workers-sdk/pull/2623) [`04d8a312`](https://github.com/cloudflare/workers-sdk/commit/04d8a3124fbcf20049b39a96654d7f3c850c032b) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix d1 directory not being created when running the `wrangler d1 execute` command with the `--yes`/`-y` flag

- [#2608](https://github.com/cloudflare/workers-sdk/pull/2608) [`70daffeb`](https://github.com/cloudflare/workers-sdk/commit/70daffebab4788322769350ab714959e3254c3b4) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: Add support for D1 databases when bundling an `_worker.js` on `wrangler pages publish`

* [#2597](https://github.com/cloudflare/workers-sdk/pull/2597) [`416babf0`](https://github.com/cloudflare/workers-sdk/commit/416babf050ed3608e0fd747111561a4c7207185e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: do not crash in wrangler dev when passing a request object to fetch

  This reverts and fixes the changes in https://github.com/cloudflare/workers-sdk/pull/1769
  which does not support creating requests from requests whose bodies have already been consumed.

  Fixes #2562

- [#2622](https://github.com/cloudflare/workers-sdk/pull/2622) [`9778b33e`](https://github.com/cloudflare/workers-sdk/commit/9778b33eb27f721fb743a970fb1520782ab0d573) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: implement `d1 list --json` with clean output for piping into other commands

  Before:

  ```bash
  rozenmd@cflaptop test % npx wrangler d1 list
  --------------------
  🚧 D1 is currently in open alpha and is not recommended for production data and traffic
  🚧 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
  🚧 To request features, visit https://community.cloudflare.com/c/developers/d1
  🚧 To give feedback, visit https://discord.gg/cloudflaredev
  --------------------

  ┌──────────────────────────────┬─────────────────┐
  │ uuid                         │ name            │
  ├──────────────────────────────┼─────────────────┤
  │ xxxxxx-xxxx-xxxx-xxxx-xxxxxx │ test            │
  ├──────────────────────────────┼─────────────────┤
  │ xxxxxx-xxxx-xxxx-xxxx-xxxxxx │ test2           │
  ├──────────────────────────────┼─────────────────┤
  │ xxxxxx-xxxx-xxxx-xxxx-xxxxxx │ test3           │
  └──────────────────────────────┴─────────────────┘
  ```

  After:

  ```bash
  rozenmd@cflaptop test % npx wrangler d1 list --json
  [
    {
      "uuid": "xxxxxx-xxxx-xxxx-xxxx-xxxxxx",
      "name": "test"
    },
    {
      "uuid": "xxxxxx-xxxx-xxxx-xxxx-xxxxxx",
      "name": "test2"
    },
    {
      "uuid": "xxxxxx-xxxx-xxxx-xxxx-xxxxxx",
      "name": "test3"
    },
  ]
  ```

* [#2631](https://github.com/cloudflare/workers-sdk/pull/2631) [`6b3fe5ef`](https://github.com/cloudflare/workers-sdk/commit/6b3fe5efc68c7a7afcd6666158a24d45033dd3db) Thanks [@thibmeu](https://github.com/thibmeu)! - Fix `wrangler publish --dry-run` to not require authentication when using Queues

- [#2627](https://github.com/cloudflare/workers-sdk/pull/2627) [`6f0f2ba6`](https://github.com/cloudflare/workers-sdk/commit/6f0f2ba65731a1f6a0b1978e5fc3a5da9a50df0f) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: implement `d1 execute --json` with clean output for piping into other commands

  **Before:**

  ```bash
  rozenmd@cflaptop test1 % npx wrangler d1 execute test --command="select * from customers"
  ▲ [WARNING] Processing wrangler.toml configuration:

      - D1 Bindings are currently in alpha to allow the API to evolve before general availability.
        Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose
        Note: Run this command with the environment variable NO_D1_WARNING=true to hide this message

        For example: `export NO_D1_WARNING=true && wrangler <YOUR COMMAND HERE>`

  --------------------
  🚧 D1 is currently in open alpha and is not recommended for production data and traffic
  🚧 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
  🚧 To request features, visit https://community.cloudflare.com/c/developers/d1
  🚧 To give feedback, visit https://discord.gg/cloudflaredev
  --------------------

  🌀 Mapping SQL input into an array of statements
  🌀 Parsing 1 statements
  🌀 Executing on test (xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx):
  🚣 Executed 1 command in 11.846710999961942ms
  ┌────────────┬─────────────────────┬───────────────────┐
  │ CustomerID │ CompanyName         │ ContactName       │
  ├────────────┼─────────────────────┼───────────────────┤
  │ 1          │ Alfreds Futterkiste │ Maria Anders      │
  ├────────────┼─────────────────────┼───────────────────┤
  │ 4          │ Around the Horn     │ Thomas Hardy      │
  ├────────────┼─────────────────────┼───────────────────┤
  │ 11         │ Bs Beverages        │ Victoria Ashworth │
  ├────────────┼─────────────────────┼───────────────────┤
  │ 13         │ Bs Beverages        │ Random Name       │
  └────────────┴─────────────────────┴───────────────────┘
  ```

**After:**

```bash
rozenmd@cflaptop test1 % npx wrangler d1 execute test --command="select * from customers" --json
[
  {
    "results": [
      {
        "CustomerID": 1,
        "CompanyName": "Alfreds Futterkiste",
        "ContactName": "Maria Anders"
      },
      {
        "CustomerID": 4,
        "CompanyName": "Around the Horn",
        "ContactName": "Thomas Hardy"
      },
      {
        "CustomerID": 11,
        "CompanyName": "Bs Beverages",
        "ContactName": "Victoria Ashworth"
      },
      {
        "CustomerID": 13,
        "CompanyName": "Bs Beverages",
        "ContactName": "Random Name"
      }
    ],
    "success": true,
    "meta": {
      "duration": 1.662519000004977,
      "last_row_id": null,
      "changes": null,
      "served_by": "primary-xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.db3",
      "internal_stats": null
    }
  }
]
```

## 2.8.1

### Patch Changes

- [#2501](https://github.com/cloudflare/workers-sdk/pull/2501) [`a0e5a491`](https://github.com/cloudflare/workers-sdk/commit/a0e5a4913621cffe757b2d14b6f3f466831f3d7f) Thanks [@geelen](https://github.com/geelen)! - fix: make it possible to query d1 databases from durable objects

  This PR makes it possible to access D1 from Durable Objects.

  To be able to query D1 from your Durable Object, you'll need to install the latest version of wrangler, and redeploy your Worker.

  For a D1 binding like:

  ```toml
  [[d1_databases]]
  binding = "DB" # i.e. available in your Worker on env.DB
  database_name = "my-database-name"
  database_id = "UUID-GOES-HERE"
  preview_database_id = "UUID-GOES-HERE"
  ```

  You'll be able to access your D1 database via `env.DB` in your Durable Object.

* [#2280](https://github.com/cloudflare/workers-sdk/pull/2280) [`ef110923`](https://github.com/cloudflare/workers-sdk/commit/ef1109235fb81200f32b953e9d448f9684d0363c) Thanks [@penalosa](https://github.com/penalosa)! - Support `queue` and `trace` events in module middleware. This means that `queue` and `trace` events should work properly with the `--test-scheduled` flag

- [#2526](https://github.com/cloudflare/workers-sdk/pull/2526) [`69d379a4`](https://github.com/cloudflare/workers-sdk/commit/69d379a48dd49c9c1812c89b2c7f1680e2196c0f) Thanks [@jrf0110](https://github.com/jrf0110)! - Adds unstable_pages module to JS API

* [#2558](https://github.com/cloudflare/workers-sdk/pull/2558) [`b910f644`](https://github.com/cloudflare/workers-sdk/commit/b910f644c7440ad034ffcaab288fcbb64deaa83b) Thanks [@caass](https://github.com/caass)! - Add metrics for deployments

- [#2554](https://github.com/cloudflare/workers-sdk/pull/2554) [`fbeaf609`](https://github.com/cloudflare/workers-sdk/commit/fbeaf6090e5eca4730358caa1838d0866d7b6006) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Add support for wasm module imports in `wrangler pages dev`

  Currently it is not possible to import `wasm` modules in either Pages
  Functions or Pages Advanced Mode projects.

  This commit caries out work to address the aforementioned issue by
  enabling `wasm` module imports in `wrangler pages dev`. As a result,
  Pages users can now import their `wasm` modules withing their Functions
  or `_worker.js` files, and `wrangler pages dev` will correctly bundle
  everything and serve these "external" modules.

  ```
  import hello from "./hello.wasm"

  export async function onRequest() {
  	const module = await WebAssembly.instantiate(hello);
  	return new Response(module.exports.hello);
  }
  ```

* [#2563](https://github.com/cloudflare/workers-sdk/pull/2563) [`5ba39569`](https://github.com/cloudflare/workers-sdk/commit/5ba39569e7ca6e341635b9beb8edebc60ad17dcd) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Copy module imports related files to outdir

  When we bundle a Worker `esbuild` takes care of writing the
  results to the output directory. However, if the Worker contains
  any `external` imports, such as text/wasm/binary module imports,
  that cannot be inlined into the same bundle file, `bundleWorker`
  will not copy these files to the output directory. This doesn't
  affect `wrangler publish` per se, because of how the Worker
  upload FormData is created. It does however create some
  inconsistencies when running `wrangler publish --outdir` or
  `wrangler publish --outdir --dry-run`, in that, `outdir` will
  not contain those external import files.

  This commit addresses this issue by making sure the aforementioned
  files do get copied over to `outdir` together with `esbuild`'s
  resulting bundle files.

## 2.8.0

### Minor Changes

- [#2538](https://github.com/cloudflare/workers-sdk/pull/2538) [`af4f27c5`](https://github.com/cloudflare/workers-sdk/commit/af4f27c5966f52e605ab7c16ff9746b7802d3479) Thanks [@edevil](https://github.com/edevil)! - feat: support EmailEvent event type in `wrangler tail`.

* [#2404](https://github.com/cloudflare/workers-sdk/pull/2404) [`3f824347`](https://github.com/cloudflare/workers-sdk/commit/3f824347c624a2cedf4af2b6bbd781b8581b08b5) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: support bundling the raw Pages `_worker.js` before deploying

  Previously, if you provided a `_worker.js` file, then Pages would simply check the
  file for disallowed imports and then deploy the file as-is.

  Not bundling the `_worker.js` file means that it cannot containing imports to other
  JS files, but also prevents Wrangler from adding shims such as the one for the D1 alpha
  release.

  This change adds the ability to tell Wrangler to pass the `_worker.js` through the
  normal Wrangler bundling process before deploying by setting the `--bundle`
  command line argument to `wrangler pages dev` and `wrangler pages publish`.

  This is in keeping with the same flag for `wrangler publish`.

  Currently bundling is opt-in, flag defaults to `false` if not provided.

### Patch Changes

- [#2525](https://github.com/cloudflare/workers-sdk/pull/2525) [`fe8c6917`](https://github.com/cloudflare/workers-sdk/commit/fe8c69173821cfa5b0277e018df3a6207234b213) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: send `wrangler docs d1` to the right place

* [#2542](https://github.com/cloudflare/workers-sdk/pull/2542) [`b44e1a75`](https://github.com/cloudflare/workers-sdk/commit/b44e1a7525248a4482248695742f3020347e3502) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Rename `--bundle` to `--no-bundle` in Pages commands to make similar to Workers

- [#2551](https://github.com/cloudflare/workers-sdk/pull/2551) [`bfffe595`](https://github.com/cloudflare/workers-sdk/commit/bfffe59558675a3c943fc24bb8b4e29066ae0581) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: wrangler init --from-dash incorrectly expects index.ts while writing index.js

  This PR fixes a bug where Wrangler would write a `wrangler.toml` expecting an index.ts file, while writing an index.js file.

* [#2529](https://github.com/cloudflare/workers-sdk/pull/2529) [`2270507c`](https://github.com/cloudflare/workers-sdk/commit/2270507c7e7c7f0be4c39a9ee283147c0fe245cd) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Remove "experimental \_routes.json" warnings

  `_routes.json` is no longer considered an experimental feature, so let's
  remove all warnings we have in place for that.

- [#2548](https://github.com/cloudflare/workers-sdk/pull/2548) [`4db768fa`](https://github.com/cloudflare/workers-sdk/commit/4db768fa5e05e4351b08113a20525c700324d502) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: path should be optional for wrangler d1 backup download

  This PR fixes a bug that forces folks to provide a `--output` flag to `wrangler d1 backup download`.

* [#2528](https://github.com/cloudflare/workers-sdk/pull/2528) [`18208091`](https://github.com/cloudflare/workers-sdk/commit/18208091335e6fa60e736cdeed46462c4be42a38) Thanks [@caass](https://github.com/caass)! - Add some guidance when folks encounter a 10021 error.

  Error code 10021 can occur when your worker doesn't pass startup validation. This error message will make it a little easier to reason about what happened and what to do next.

  Closes #2519

- [#1769](https://github.com/cloudflare/workers-sdk/pull/1769) [`6a67efe9`](https://github.com/cloudflare/workers-sdk/commit/6a67efe9ae1da27fb95ffb030959465781bc74b6) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - allow `fetch()` calls locally to accept URL Objects

## 2.7.1

### Patch Changes

- [#2523](https://github.com/cloudflare/workers-sdk/pull/2523) [`a5e9958c`](https://github.com/cloudflare/workers-sdk/commit/a5e9958c7e37dd38c00ac6b713a21441491777fd) Thanks [@jahands](https://github.com/jahands)! - fix: unstable_dev() experimental options incorrectly applying defaults

  A subtle difference when removing object-spreading of experimental unstable_dev() options caused `wrangler pages dev` interactivity to stop working. This switches back to object-spreading the passed in options on top of the defaults, fixing the issue.

## 2.7.0

### Minor Changes

- [#2465](https://github.com/cloudflare/workers-sdk/pull/2465) [`e1c2f5b9`](https://github.com/cloudflare/workers-sdk/commit/e1c2f5b9653ecc183bbc8a33531babd26e10d241) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - After this PR, `wrangler init --yes` will generate a test for your new Worker project, using Vitest with TypeScript.
  When using `wrangler init`, and choosing to create a Typescript project, you will now be asked if Wrangler should write tests for you, using Vitest.

  This resolves issue #2436.

* [#2333](https://github.com/cloudflare/workers-sdk/pull/2333) [`71691421`](https://github.com/cloudflare/workers-sdk/commit/7169142171b1c9b4ff2f19b8b46871932ef7d10a) Thanks [@markjmiller](https://github.com/markjmiller)! - Remove the experimental binding warning from Dispatch Namespace since [it is GA](https://blog.cloudflare.com/workers-for-platforms-ga/).

### Patch Changes

- [#2460](https://github.com/cloudflare/workers-sdk/pull/2460) [`c2b2dfb8`](https://github.com/cloudflare/workers-sdk/commit/c2b2dfb8e5b44ee73418a01682e65d0ca1320797) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: resolve unstable_dev flakiness in tests by awaiting the dev registry

* [#2439](https://github.com/cloudflare/workers-sdk/pull/2439) [`616f8739`](https://github.com/cloudflare/workers-sdk/commit/616f8739253381e8d691084961159d1a0073d81f) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix(wrangler): do not login or read wrangler.toml when applying D1 migrations in local mode.

  When applying D1 migrations to a deployed database, it is important that we are logged in
  and that we have the database ID from the wrangler.toml.
  This is not needed for `--local` mode where we are just writing to a local SQLite file.

- [#1869](https://github.com/cloudflare/workers-sdk/pull/1869) [`917b07b0`](https://github.com/cloudflare/workers-sdk/commit/917b07b0d7ee6cdfae2edfa21fe3056a4475dd44) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: enable Wrangler to target the staging API by setting WRANGLER_API_ENVIRONMENT=staging

  If you are developing Wrangler, or an internal Cloudflare feature, and during testing,
  need Wrangler to target the staging API rather than production, it is now possible by
  setting the `WRANGLER_API_ENVIRONMENT` environment variable to `staging`.

  This will update all the necessary OAuth and API URLs, update the OAuth client ID, and
  also (if necessary) acquire an Access token for to get through the firewall to the
  staging URLs.

* [#2377](https://github.com/cloudflare/workers-sdk/pull/2377) [`32686e42`](https://github.com/cloudflare/workers-sdk/commit/32686e42b055c786f9821bbd66dd33960ab8f4d1) Thanks [@mrbbot](https://github.com/mrbbot)! - Fix `ReferenceError` when using `wrangler dev --experimental-local` in Node 16

- [#2393](https://github.com/cloudflare/workers-sdk/pull/2393) [`a6d24732`](https://github.com/cloudflare/workers-sdk/commit/a6d24732e2553e220222cba7b70d9f1607602203) Thanks [@mrbbot](https://github.com/mrbbot)! - Remove login requirement from `wrangler dev --experimental-local`

* [#2502](https://github.com/cloudflare/workers-sdk/pull/2502) [`6b7ebc8d`](https://github.com/cloudflare/workers-sdk/commit/6b7ebc8dd0dee5521bce49a6dfff997d308e900e) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to [`2.11.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.11.0)

- [#2485](https://github.com/cloudflare/workers-sdk/pull/2485) [`4c0e2309`](https://github.com/cloudflare/workers-sdk/commit/4c0e230950e9ef3dcb37d5b222b642cb0b0d8c9e) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Pages Plugin routing when mounted at the root of a project

  Previously, there was a bug which meant that Plugins mounted at the root of a Pages project were not correctly matching incoming requests. This change fixes that bug so Plugins mounted at the root should now correctly work.

* [#2479](https://github.com/cloudflare/workers-sdk/pull/2479) [`7b479b91`](https://github.com/cloudflare/workers-sdk/commit/7b479b9104266c83dda3b4e4a89ab9b919b743f0) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: bump d1js

  This PR bumps d1js, adding the following functionality to the d1 alpha shim:

  - validates supported types
  - converts ArrayBuffer to array
  - converts typedArray to array

- [#2392](https://github.com/cloudflare/workers-sdk/pull/2392) [`7785591c`](https://github.com/cloudflare/workers-sdk/commit/7785591c95281a85ffb61eb514b850144970c4b2) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: improve `wrangler init --from-dash` help text and error handling

* [#2391](https://github.com/cloudflare/workers-sdk/pull/2391) [`19525a4b`](https://github.com/cloudflare/workers-sdk/commit/19525a4b9ca8d26022510fef463d0169f704896e) Thanks [@mrbbot](https://github.com/mrbbot)! - Always log when delegating to local `wrangler` install.

  When a global `wrangler` command is executed in a package directory with `wrangler` installed locally, the command is redirected to the local `wrangler` install.
  We now always log a message when this happens, so you know what's going on.

- [#2468](https://github.com/cloudflare/workers-sdk/pull/2468) [`97282459`](https://github.com/cloudflare/workers-sdk/commit/972824598438cc40c6179ea9d2d0229cbd9f3684) Thanks [@rozenmd](https://github.com/rozenmd)! - BREAKING CHANGE: move experimental options under the experimental object for unstable_dev

* [#2477](https://github.com/cloudflare/workers-sdk/pull/2477) [`3bd1b676`](https://github.com/cloudflare/workers-sdk/commit/3bd1b6765729d39f0a5d2adef06cffeac7766b51) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: update NO_D1_WARNING to make it clear how to turn it off

- [#2495](https://github.com/cloudflare/workers-sdk/pull/2495) [`e93063e9`](https://github.com/cloudflare/workers-sdk/commit/e93063e9854059ab4cc9a71fd22362b4ca01d3e9) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix(d1): ensure that migrations support compound statements

  This fix updates the SQL statement splitting so that it does not split in the middle of compound statements.
  Previously we were using a third party splitting library, but this needed fixing and was actually unnecessary for our purposes.
  So a new splitter has been implemented and the library dependency removed.
  Also the error handling in `d1 migrations apply` has been improved to handle a wider range of error types.

  Fixes #2463

* [#2400](https://github.com/cloudflare/workers-sdk/pull/2400) [`08a0b22e`](https://github.com/cloudflare/workers-sdk/commit/08a0b22e3f7e5ed536b7537ee5e93c39544bcfa0) Thanks [@mrbbot](https://github.com/mrbbot)! - Cleanly exit `wrangler dev --experimental-local` when pressing `x`/`q`/`CTRL-C`

- [#2374](https://github.com/cloudflare/workers-sdk/pull/2374) [`ecba1ede`](https://github.com/cloudflare/workers-sdk/commit/ecba1edea298b89cdffa4b68c924d879f0f0d13b) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: make --from-dash error output clearer

  This PR makes it clearer what --from-dash wants from you.

  closes #2373
  closes #2375

* [#2377](https://github.com/cloudflare/workers-sdk/pull/2377) [`32686e42`](https://github.com/cloudflare/workers-sdk/commit/32686e42b055c786f9821bbd66dd33960ab8f4d1) Thanks [@mrbbot](https://github.com/mrbbot)! - Respect `FORCE_COLOR=0` environment variable to disable colored output when using `wrangler dev --local`

- [#2455](https://github.com/cloudflare/workers-sdk/pull/2455) [`d9c1d273`](https://github.com/cloudflare/workers-sdk/commit/d9c1d2739c8335b0d7ba386e27a370aff1eca7b7) Thanks [@rozenmd](https://github.com/rozenmd)! - BREAKING CHANGE: refactor unstable_dev to use an experimental object, instead of a second options object

  Before, if you wanted to disable the experimental warning, you would run:

  ```js
  worker = await unstable_dev(
  	"src/index.js",
  	{},
  	{ disableExperimentalWarning: true }
  );
  ```

  After this change, you'll need to do this instead:

  ```js
  worker = await unstable_dev("src/index.js", {
  	experimental: { disableExperimentalWarning: true },
  });
  ```

## 2.6.2

### Patch Changes

- [#2355](https://github.com/cloudflare/workers-sdk/pull/2355) [`df6fea02`](https://github.com/cloudflare/workers-sdk/commit/df6fea02b53066e54c12770cdb439e2dbb3208ea) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: don't ask for preview_database_id in --local

* [#2349](https://github.com/cloudflare/workers-sdk/pull/2349) [`8173bcca`](https://github.com/cloudflare/workers-sdk/commit/8173bcca09fde15ffdde72bd125fb6968f4a9272) Thanks [@jspspike](https://github.com/jspspike)! - Initially check that worker exists when using --from-dash

- [#2356](https://github.com/cloudflare/workers-sdk/pull/2356) [`228781ee`](https://github.com/cloudflare/workers-sdk/commit/228781eeb4b2d22275312876d07191017b6d8a06) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: add wrangler docs command

* [#2364](https://github.com/cloudflare/workers-sdk/pull/2364) [`4bdb1f6d`](https://github.com/cloudflare/workers-sdk/commit/4bdb1f6d0d3fbc4603542a743d25376574e0cdfc) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: implement `wrangler docs <command>`

  closes #2359

- [#2341](https://github.com/cloudflare/workers-sdk/pull/2341) [`5afa13ec`](https://github.com/cloudflare/workers-sdk/commit/5afa13ec8026bcfe4e09f4b523733236ccec0814) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: d1 - don't backup prod db when applying migrations locally

  Closes #2336

## 2.6.1

### Patch Changes

- [#2339](https://github.com/cloudflare/workers-sdk/pull/2339) [`f6821189`](https://github.com/cloudflare/workers-sdk/commit/f6821189110e5b6301fe77509a6bb9a8652bbc1b) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: `wrangler dev --local` now correctly lazy-imports `@miniflare/tre`

  Previously, we introduced a bug where we were incorrectly requiring `@miniflare/tre`, even when not using the `workerd`/`--experimental-local` mode.

## 2.6.0

### Minor Changes

- [#2268](https://github.com/cloudflare/workers-sdk/pull/2268) [`3be1c2cf`](https://github.com/cloudflare/workers-sdk/commit/3be1c2cf99fdaef1e612937ccc487a5196c5df67) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Add support for `--experimental-local` to `wrangler pages dev` which will use the `workerd` runtime.

  Add `@miniflare/tre` environment polyfill to `@cloudflare/pages-shared`.

* [#2163](https://github.com/cloudflare/workers-sdk/pull/2163) [`d73a34be`](https://github.com/cloudflare/workers-sdk/commit/d73a34be07c0bd14dc2eabc8cb0474f0d4a64c53) Thanks [@jimhawkridge](https://github.com/jimhawkridge)! - feat: Add support for Analytics Engine bindings.

  For example:

  ```
  analytics_engine_datasets = [
      { binding = "ANALYTICS", dataset = "my_dataset" }
  ]
  ```

### Patch Changes

- [#2177](https://github.com/cloudflare/workers-sdk/pull/2177) [`e98613f8`](https://github.com/cloudflare/workers-sdk/commit/e98613f8e2f417f996f351a67cdff54c05f0d194) Thanks [@caass](https://github.com/caass)! - Trigger login flow if a user runs `wrangler dev` while logged out

  Previously, we would just error if a user logged out and then ran `wrangler dev`.
  Now, we kick them to the OAuth flow and suggest running `wrangler dev --local` if
  the login fails.

  Closes [#2147](https://github.com/cloudflare/workers-sdk/issues/2147)

* [#2298](https://github.com/cloudflare/workers-sdk/pull/2298) [`bb5e4f91`](https://github.com/cloudflare/workers-sdk/commit/bb5e4f91512d9e12e7a90a9db3ee426b5e535934) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: d1 not using the preview database when using `wrangler dev`

  After this fix, wrangler will correctly connect to the preview database, rather than the prod database when using `wrangler dev`

- [#2176](https://github.com/cloudflare/workers-sdk/pull/2176) [`d48ee112`](https://github.com/cloudflare/workers-sdk/commit/d48ee1124a4a7a8834e228ccdaafbc3fc71b9357) Thanks [@caass](https://github.com/caass)! - Use the user's preferred default branch name if set in .gitconfig.

  Previously, we would initialize new workers with `main` as the name of the default branch.
  Now, we see if the user has a custom setting in .gitconfig for `init.defaultBranch`, and use
  that if it exists.

  Closes #2112

* [#2275](https://github.com/cloudflare/workers-sdk/pull/2275) [`bbfb6a96`](https://github.com/cloudflare/workers-sdk/commit/bbfb6a960e1f57a1b3214497f05f1d55b8dfb5c0) Thanks [@mrbbot](https://github.com/mrbbot)! - Fix script reloads, and allow clean exits, when using `--experimental-local` on Linux

- [#2275](https://github.com/cloudflare/workers-sdk/pull/2275) [`bbfb6a96`](https://github.com/cloudflare/workers-sdk/commit/bbfb6a960e1f57a1b3214497f05f1d55b8dfb5c0) Thanks [@mrbbot](https://github.com/mrbbot)! - Fix DevTools inspector support when using `--(experimental-)local`

## 2.5.0

### Minor Changes

- [#2212](https://github.com/cloudflare/workers-sdk/pull/2212) [`b24c2b2d`](https://github.com/cloudflare/workers-sdk/commit/b24c2b2dc639a3b3ff528591d1758753cb64fc3c) Thanks [@dalbitresb12](https://github.com/dalbitresb12)! - feat: Allow pages dev to proxy websocket requests

### Patch Changes

- [#2296](https://github.com/cloudflare/workers-sdk/pull/2296) [`7da8f0e6`](https://github.com/cloudflare/workers-sdk/commit/7da8f0e69932d2ac849ecb06ab280c1d8756619f) Thanks [@Skye-31](https://github.com/Skye-31)! - Fix: check response status of `d1 backup download` command before writing contents to file

* [#2260](https://github.com/cloudflare/workers-sdk/pull/2260) [`c2940160`](https://github.com/cloudflare/workers-sdk/commit/c29401604640940a5382a206f7bac900a3aad7b2) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: make it possible to use a local db for d1 migrations

  As of this change, wrangler's d1 migrations commands now accept `local` and `persist-to` as flags, so migrations can run against the local d1 db.

- [#1883](https://github.com/cloudflare/workers-sdk/pull/1883) [`60d31c01`](https://github.com/cloudflare/workers-sdk/commit/60d31c010656d10e0093921259019f67f15554ec) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Fix `--port=0` option to report the actually used port.

## 2.4.4

### Patch Changes

- [#2265](https://github.com/cloudflare/workers-sdk/pull/2265) [`42d88e3f`](https://github.com/cloudflare/workers-sdk/commit/42d88e3f8dda5b40d17bd684cfc5475ab1505a18) Thanks [@WalshyDev](https://github.com/WalshyDev)! - Fix D1 bindings in `wrangler pages dev`

## 2.4.3

### Patch Changes

- [#2249](https://github.com/cloudflare/workers-sdk/pull/2249) [`e41c7e41`](https://github.com/cloudflare/workers-sdk/commit/e41c7e41c3ee36d852daad859cd8cbb31641f95f) Thanks [@mrbbot](https://github.com/mrbbot)! - Enable pretty source-mapped error pages when using `--experimental-local`

* [#2208](https://github.com/cloudflare/workers-sdk/pull/2208) [`5bd04296`](https://github.com/cloudflare/workers-sdk/commit/5bd04296ea15a72fbd8c3ac395d129d0dcfb9179) Thanks [@OilyLime](https://github.com/OilyLime)! - Add link to Queues tab in dashboard when unauthorized to use Queues

- [#2248](https://github.com/cloudflare/workers-sdk/pull/2248) [`effc2215`](https://github.com/cloudflare/workers-sdk/commit/effc2215dd3b4a5be539d22795a59b02ca5164ff) Thanks [@rozenmd](https://github.com/rozenmd)! - chore: remove d1 local hardcoding

  Prior to this change wrangler would only ever use local mode when testing d1.

  After this change d1 tests can access both local and remote Workers.

* [#2254](https://github.com/cloudflare/workers-sdk/pull/2254) [`9e296a4d`](https://github.com/cloudflare/workers-sdk/commit/9e296a4d0e71e7453e4b6722e7e12042040590ab) Thanks [@penalosa](https://github.com/penalosa)! - Add an option to customise whether `wrangler login` opens a browser automatically. Use `wrangler login --no-browser` to prevent a browser being open—the link will be printed to the console so it can be manually opened.

## 2.4.2

### Patch Changes

- [#2232](https://github.com/cloudflare/workers-sdk/pull/2232) [`5241925a`](https://github.com/cloudflare/workers-sdk/commit/5241925aba4dd8566b0fa2ce69ea665a56581397) Thanks [@mrbbot](https://github.com/mrbbot)! - Fix `wrangler types` generation for service-worker type Workers`

## 2.4.1

### Patch Changes

- [#2229](https://github.com/cloudflare/workers-sdk/pull/2229) [`8eb53b1a`](https://github.com/cloudflare/workers-sdk/commit/8eb53b1a225ba947a6da4303e4cabc4660974288) Thanks [@mrbbot](https://github.com/mrbbot)! - Unhide `--live-reload` option for local mode development

* [#2209](https://github.com/cloudflare/workers-sdk/pull/2209) [`d0f237d9`](https://github.com/cloudflare/workers-sdk/commit/d0f237d9965f782ae8415fe9ff02e83e6e86b9af) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - This change makes the metrics directory XDG compliant

  resolves #2075

- [#2213](https://github.com/cloudflare/workers-sdk/pull/2213) [`afdb7e49`](https://github.com/cloudflare/workers-sdk/commit/afdb7e49828b5854742750dcc13bb2866f790492) Thanks [@mrbbot](https://github.com/mrbbot)! - Enable the Cache API when using `--experimental-local`

## 2.4.0

### Minor Changes

- [#2193](https://github.com/cloudflare/workers-sdk/pull/2193) [`0047ad30`](https://github.com/cloudflare/workers-sdk/commit/0047ad304fd28f7c7f012549bfbc05d3477c7ef9) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - Local Mode Console Support
  Added support for detailed `console.log` capability when using `--experimental-local`

  resolves #2122

### Patch Changes

- [#2192](https://github.com/cloudflare/workers-sdk/pull/2192) [`add4278a`](https://github.com/cloudflare/workers-sdk/commit/add4278a2e576e4e13691a4108613c642de3005d) Thanks [@mrbbot](https://github.com/mrbbot)! - Add a `--experimental-local-remote-kv` flag to enable reading/writing from/to real KV namespaces.
  Note this flag requires `--experimental-local` to be enabled.

* [#2204](https://github.com/cloudflare/workers-sdk/pull/2204) [`c725ce01`](https://github.com/cloudflare/workers-sdk/commit/c725ce011f5e57147dc8a2c714926edd7e2a4bfb) Thanks [@jahands](https://github.com/jahands)! - fix: Upload filepath-routing configuration in wrangler pages publish

  Publishing Pages projects containing a functions directory incorrectly did not upload the filepath-routing config so that the user can view it in Dash. This fixes that, making the generated routes viewable under `Routing configuration` in the `Functions` tab of a deployment.

## 2.3.2

### Patch Changes

- [#2197](https://github.com/cloudflare/workers-sdk/pull/2197) [`a3533024`](https://github.com/cloudflare/workers-sdk/commit/a3533024ee63c7c7b1092b661ea40b789874cf9f) Thanks [@geelen](https://github.com/geelen)! - fix: truncate lines longer than 70 chars when executing d1 sql

## 2.3.1

### Patch Changes

- [#2194](https://github.com/cloudflare/workers-sdk/pull/2194) [`3dccedf1`](https://github.com/cloudflare/workers-sdk/commit/3dccedf1d1f346c7a686c5c83783c0488cb72f87) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: make it possible to use d1 in scheduled and queue workers

## 2.3.0

### Minor Changes

- [#2077](https://github.com/cloudflare/workers-sdk/pull/2077) [`c9b564dc`](https://github.com/cloudflare/workers-sdk/commit/c9b564dc23b298dc5efc08510fbf5b9d03992dc0) Thanks [@jrf0110](https://github.com/jrf0110)! - Adds tailing for Pages Functions

### Patch Changes

- [#2178](https://github.com/cloudflare/workers-sdk/pull/2178) [`d165b741`](https://github.com/cloudflare/workers-sdk/commit/d165b74191e396489b0d7052bc09d911a1b73bfe) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - [feat] Queues generated type:
  Added the ability to generate manual types for Queues from
  Wrangler configuration.

## 2.2.3

### Patch Changes

- [#2182](https://github.com/cloudflare/workers-sdk/pull/2182) [`7d8d53a7`](https://github.com/cloudflare/workers-sdk/commit/7d8d53a7272059633e0928f8b2e039fc2390acb9) Thanks [@geelen](https://github.com/geelen)! - Wrangler D1 now supports the alpha release of migrations.

* [#2138](https://github.com/cloudflare/workers-sdk/pull/2138) [`2be9d642`](https://github.com/cloudflare/workers-sdk/commit/2be9d64257ea5e4a957906bf6992fc97dc46e1f2) Thanks [@mrbbot](https://github.com/mrbbot)! - Reduce script reload times when using `wrangler dev --experimental-local`

## 2.2.2

### Patch Changes

- [#2172](https://github.com/cloudflare/workers-sdk/pull/2172) [`47a142af`](https://github.com/cloudflare/workers-sdk/commit/47a142af42dd7f587d40d4436731af09514c1c71) Thanks [@KianNH](https://github.com/KianNH)! - Validate object size for wrangler r2 put

* [#2161](https://github.com/cloudflare/workers-sdk/pull/2161) [`dff756f3`](https://github.com/cloudflare/workers-sdk/commit/dff756f3250240ec18a1d8564ac2cf0572b8d82e) Thanks [@jbw1991](https://github.com/jbw1991)! - Check for the correct API error code when attempting to detect missing Queues.

- [#2165](https://github.com/cloudflare/workers-sdk/pull/2165) [`a26f74ba`](https://github.com/cloudflare/workers-sdk/commit/a26f74ba4269b42ed9a3cc119b7fc6e40697f639) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - Fix Var string type:
  The type was not being coerced to a string, so TypeScript considered it a unresolved type.

## 2.2.1

### Patch Changes

- [#2067](https://github.com/cloudflare/workers-sdk/pull/2067) [`758419ed`](https://github.com/cloudflare/workers-sdk/commit/758419ed05b430664f5c680b06f60b403cd00854) Thanks [@Skye-31](https://github.com/Skye-31)! - fix: Accurately determine when using imports in \_worker.js for Advanced Mode Pages Functions

* [#2159](https://github.com/cloudflare/workers-sdk/pull/2159) [`c5a7557f`](https://github.com/cloudflare/workers-sdk/commit/c5a7557fb9adc54aa96e86812906420afc5accb1) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: silence the 10023 error that throws when deployments isn't fully rolled out

- [#2067](https://github.com/cloudflare/workers-sdk/pull/2067) [`758419ed`](https://github.com/cloudflare/workers-sdk/commit/758419ed05b430664f5c680b06f60b403cd00854) Thanks [@Skye-31](https://github.com/Skye-31)! - fix: D1 support for Pages Functions

* [#2067](https://github.com/cloudflare/workers-sdk/pull/2067) [`758419ed`](https://github.com/cloudflare/workers-sdk/commit/758419ed05b430664f5c680b06f60b403cd00854) Thanks [@Skye-31](https://github.com/Skye-31)! - chore: Refactor Pages Functions bundling

## 2.2.0

### Minor Changes

- [#2107](https://github.com/cloudflare/workers-sdk/pull/2107) [`511943e9`](https://github.com/cloudflare/workers-sdk/commit/511943e9226f787aa997a325d39dc2caac05a73c) Thanks [@celso](https://github.com/celso)! - fix: D1 execute and backup commands improvements

  - Better and faster handling when importing big SQL files using execute --file
  - Increased visibility during imports, sends output with each batch API call
  - Backups are now downloaded to the directory where wrangler was initiated from

* [#2130](https://github.com/cloudflare/workers-sdk/pull/2130) [`68f4fa6f`](https://github.com/cloudflare/workers-sdk/commit/68f4fa6ff7d537c602c3b2ba99e9ce3afdbf2242) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - feature: Add warnings around bundle sizes for large scripts

  Prints a warning for scripts > 1MB compressed, encouraging smaller
  script sizes. This warning can be silenced by setting the
  NO_SCRIPT_SIZE_WARNING env variable

  If a publish fails with either a script size error or a validator error
  on script startup (CPU or memory), we print out the largest 5
  dependencies in your bundle. This is accomplished by using the esbuild
  generated metafile.

- [#2064](https://github.com/cloudflare/workers-sdk/pull/2064) [`49b6a484`](https://github.com/cloudflare/workers-sdk/commit/49b6a484508defb88a01b7a2d48119ec82bd5d86) Thanks [@jbw1991](https://github.com/jbw1991)! - Adds support for Cloudflare Queues. Adds new CLI commands to configure Queues. Queue producers and consumers can be defined in wrangler.toml.

* [#1982](https://github.com/cloudflare/workers-sdk/pull/1982) [`5640fe88`](https://github.com/cloudflare/workers-sdk/commit/5640fe8889da6d14cc14b56b6c0470980de7bd66) Thanks [@penalosa](https://github.com/penalosa)! - Enable support for `wrangler dev` on Workers behind Cloudflare Access, utilising `cloudflared`. If you don't have `cloudflared` installed, Wrangler will prompt you to install it. If you _do_, then the first time you start developing using `wrangler dev` your default browser will open with a Cloudflare Access prompt.

### Patch Changes

- [#2134](https://github.com/cloudflare/workers-sdk/pull/2134) [`b164e2d6`](https://github.com/cloudflare/workers-sdk/commit/b164e2d6faff3a9a18f447ff47fe98e8cee24c86) Thanks [@jspspike](https://github.com/jspspike)! - Added current version to publish output

* [#2127](https://github.com/cloudflare/workers-sdk/pull/2127) [`0e561e83`](https://github.com/cloudflare/workers-sdk/commit/0e561e8385bc8437dece78d3b805dad43bda830c) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - Fix: Missing Worker name using `--from-dash`
  Added the `--from-dash` name as a fallback when no name is provided in the `wrangler init` command.
  Additionally added a checks to the `std.out` to ensure that the name is provided.

  resolves #1853

- [#2073](https://github.com/cloudflare/workers-sdk/pull/2073) [`1987a79d`](https://github.com/cloudflare/workers-sdk/commit/1987a79d43158ebc6eeb54b2102214060266b6d7) Thanks [@mrbbot](https://github.com/mrbbot)! - If `--env <env>` is specified, we'll now check `.env.<env>`/`.dev.vars.<env>` first.
  If they don't exist, we'll fallback to `.env`/`.dev.vars`.

* [#2072](https://github.com/cloudflare/workers-sdk/pull/2072) [`06aa6121`](https://github.com/cloudflare/workers-sdk/commit/06aa61214bc71077ff55fecbe1581af9b5ad68ff) Thanks [@mrbbot](https://github.com/mrbbot)! - Fixed importing installed npm packages with the same name as Node built-in
  modules if `node_compat` is disabled.

- [#2124](https://github.com/cloudflare/workers-sdk/pull/2124) [`02ca556c`](https://github.com/cloudflare/workers-sdk/commit/02ca556c3e84d45cb3eaa5787a4a0ed5254c3815) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - Computing the name from binding response
  Now the `vars` will be computed, example:
  `[var.binding.name]: var.binding.text`

  this will resolve the issue that was occurring with
  generating a TOML with incorrect fields for the `vars` key/value pair.

  resolves #2048

## 2.1.15

### Patch Changes

- [#2103](https://github.com/cloudflare/workers-sdk/pull/2103) [`f1fd62a1`](https://github.com/cloudflare/workers-sdk/commit/f1fd62a11642de45eb87ebacb044fe8fcf2beea2) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Don't upload `functions/` directory as part of `wrangler pages publish`

  If the root directory of a project was the same as the build output directory, we were previously uploading the `functions/` directory as static assets. This PR now ensures that the `functions/` files are only used to create Pages Functions and are no longer uploaded as static assets.

  Additionally, we also now _do_ upload `_worker.js`, `_headers`, `_redirects` and `_routes.json` if they aren't immediate children of the build output directory. Previously, we'd ignore all files with this name regardless of location. For example, if you have a `public/blog/how-to-use-pages/_headers` file (where `public` is your build output directory), we will now upload the `_headers` file as a static asset.

* [#2111](https://github.com/cloudflare/workers-sdk/pull/2111) [`ab52f771`](https://github.com/cloudflare/workers-sdk/commit/ab52f7717ffd5411886d1e30aee98f821237ddad) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Add a `passThroughOnException()` handler in Pages Functions

  This `passThroughOnException()` handler is not as good as the built-in for Workers. We're just adding it now as a stop-gap until we can do the behind-the-scenes plumbing required to make the built-in function work properly.

  We wrap your Pages Functions code in a `try/catch` and on failure, if you call `passThroughOnException()` we defer to the static assets of your project.

  For example:

  ```ts
  export const onRequest = ({ passThroughOnException }) => {
  	passThroughOnException();

  	x; // Would ordinarily throw an error, but instead, static assets are served.
  };
  ```

- [#2117](https://github.com/cloudflare/workers-sdk/pull/2117) [`aa08ff7c`](https://github.com/cloudflare/workers-sdk/commit/aa08ff7cc76913f010cf0a98e7e0e97b5641d2c8) Thanks [@nprogers](https://github.com/nprogers)! - Added error logging for pages upload

## 2.1.14

### Patch Changes

- [#2074](https://github.com/cloudflare/workers-sdk/pull/2074) [`b08ab1e5`](https://github.com/cloudflare/workers-sdk/commit/b08ab1e507a740f6f120b66a5435f4bd0a9cd42c) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - The type command aggregates bindings and [custom module rules](https://developers.cloudflare.com/workers/wrangler/configuration/#bundling) from config, then generates a DTS file for both service workers' `declare global { ... }` or module workers' `interface Env { ... }`

  Custom module rules generate `declare module`s based on the module type (`Text`, `Data` or `CompiledWasm`).
  Module Example Outputs:

  **CompiledWasm**

  ```ts
  declare module "**/*.wasm" {
  	const value: WebAssembly.Module;
  	export default value;
  }
  ```

  **Data**

  ```ts
  declare module "**/*.webp" {
  	const value: ArrayBuffer;
  	export default value;
  }
  ```

  **Text**

  ```ts
  declare module "**/*.text" {
  	const value: string;
  	export default value;
  }
  ```

  resolves #2034
  resolves #2033

* [#2065](https://github.com/cloudflare/workers-sdk/pull/2065) [`14c44588`](https://github.com/cloudflare/workers-sdk/commit/14c44588c9d22e9c9f2ad2740df57809d0cbcfbc) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix(pages): `wrangler pages dev` matches routing rules in `_routes.json` too loosely

  Currently, the logic by which we transform routing rules in `_routes.json` to
  regular expressions, so we can perform `pathname` matching & routing when we
  run `wrangler pages dev`, is too permissive, and leads to serving incorrect
  assets for certain url paths.

  For example, a routing rule such as `/foo` will incorrectly match pathname
  `/bar/foo`. Similarly, pathname `/foo` will be incorrectly matched by the
  `/` routing rule.
  This commit fixes our routing rule to pathname matching logic and brings
  `wrangler pages dev` on par with routing in deployed Pages projects.

- [#2098](https://github.com/cloudflare/workers-sdk/pull/2098) [`2a81caee`](https://github.com/cloudflare/workers-sdk/commit/2a81caeeb785d0aa6ee242297c87ba62dfba48e7) Thanks [@threepointone](https://github.com/threepointone)! - feat: delete site/assets namespace when a worker is deleted

  This patch deletes any site/asset kv namespaces associated with a worker when `wrangler delete` is used. It finds the namespace associated with a worker by using the names it would have otherwise used, and deletes it. It also does the same for the preview namespace that's used with `wrangler dev`.

* [#2091](https://github.com/cloudflare/workers-sdk/pull/2091) [`9491d86f`](https://github.com/cloudflare/workers-sdk/commit/9491d86fef30759033a4435514560cba72c2c046) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - Wrangler deployments command
  Added support for the deployments command, which allows you to list the last ten deployments for a given script.

  The information will include:

  - Version ID
  - Version number
  - Author email
  - Latest deploy
  - Created on

  resolves #2089

- [#2068](https://github.com/cloudflare/workers-sdk/pull/2068) [`2c1fd9d2`](https://github.com/cloudflare/workers-sdk/commit/2c1fd9d2772f9b2109e3c3aa7dec759138823c8d) Thanks [@mrbbot](https://github.com/mrbbot)! - Fixed issue where information and warning messages from Miniflare were being
  discarded when using `wrangler dev --local`. Logs from Miniflare will now be
  coloured too, if the terminal supports this.

## 2.1.13

### Patch Changes

- [#2049](https://github.com/cloudflare/workers-sdk/pull/2049) [`903b55d1`](https://github.com/cloudflare/workers-sdk/commit/903b55d13d83f80a2893d7763f5bc220b0df2c3c) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: add missing `local` argument to unstable_dev's DevOptions

* [#2026](https://github.com/cloudflare/workers-sdk/pull/2026) [`7d987ee2`](https://github.com/cloudflare/workers-sdk/commit/7d987ee270b53105b2794e8d6bced785b4b0925d) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Default to today's compatibility date in `wrangler pages dev`

  Like `wrangler dev` proper, `wrangler pages dev` now defaults to using today's compatibility date.
  It can be overriden with `--compatibility-date=YYYY-MM-DD`.

  https://developers.cloudflare.com/workers/platform/compatibility-dates/

- [#2035](https://github.com/cloudflare/workers-sdk/pull/2035) [`76a66fc2`](https://github.com/cloudflare/workers-sdk/commit/76a66fc2b6148c1764ac55a4ad79c42fcef9cf22) Thanks [@penalosa](https://github.com/penalosa)! - Warn when opening a tail on workers for which a restart could be disruptive (i.e. Workers which use Durable Objects in conjunction with WebSockets)

* [#2045](https://github.com/cloudflare/workers-sdk/pull/2045) [`c2d3286f`](https://github.com/cloudflare/workers-sdk/commit/c2d3286fab527042eca76fd3626d1be0f79612cf) Thanks [@threepointone](https://github.com/threepointone)! - feat: implement a basic `wrangler delete`

  This PR adds a simple (but useful!) implementation for `wrangler delete`. Of note, it'll delete a given service, including all it's bindings. It uses the same api as the dashboard.

## 2.1.12

### Patch Changes

- [#2023](https://github.com/cloudflare/workers-sdk/pull/2023) [`d6660ce3`](https://github.com/cloudflare/workers-sdk/commit/d6660ce3e26d44b4db39b149868cb850e47763f0) Thanks [@caass](https://github.com/caass)! - Display a more helpful error when trying to publish to a route in use by another worker.

  Previously, when trying to publish a worker to a route that was in use by another worker,
  there would be a really unhelpful message about a failed API call. Now, there's a much
  nicer message that tells you what worker is running on that route, and gives you a link
  to the workers overview page so you can unassign it if you want.

  ```text
   ⛅️ wrangler 2.1.11
  --------------------
  Total Upload: 0.20 KiB / gzip: 0.17 KiB

  ✘ [ERROR] Can't publish a worker to routes that are assigned to another worker.

    "test-custom-routes-redeploy" is already assigned to route
    test-custom-worker.swag.lgbt

    Unassign other workers from the routes you want to publish to, and then try again.
    Visit
    https://dash.cloudflare.com/<account_id>/workers/overview
    to unassign a worker from a route.
  ```

  Closes #1849

* [#2013](https://github.com/cloudflare/workers-sdk/pull/2013) [`c63ca0a5`](https://github.com/cloudflare/workers-sdk/commit/c63ca0a550a4c3801665161d6d6ce5d2d3bff0a5) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: make d1 help print if a command is incomplete

  Prior to this change, d1's commands would return silently if wrangler wasn't supplied enough arguments to run the command.

  This change resolves this issue, and ensures help is always printed if the command couldn't run.

- [#2016](https://github.com/cloudflare/workers-sdk/pull/2016) [`932fecc0`](https://github.com/cloudflare/workers-sdk/commit/932fecc0857dfdf8401b2293f71c34836a5bbb9d) Thanks [@caass](https://github.com/caass)! - Offer to create a workers.dev subdomain if a user needs one

  Previously, when a user wanted to publish a worker to https://workers.dev by setting `workers_dev = true` in their `wrangler.toml`,
  but their account didn't have a subdomain registered, we would error out.

  Now, we offer to create one for them. It's not implemented for `wrangler dev`, which also expects you to have registered a
  workers.dev subdomain, but we now error correctly and tell them what the problem is.

* [#2003](https://github.com/cloudflare/workers-sdk/pull/2003) [`3ed06b40`](https://github.com/cloudflare/workers-sdk/commit/3ed06b4096d3ea9ed601ae05d77442e5b0217678) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Bump miniflare@2.10.0

- [#2024](https://github.com/cloudflare/workers-sdk/pull/2024) [`4ad48e4d`](https://github.com/cloudflare/workers-sdk/commit/4ad48e4d9b617dd322c6d4b9c0853588a1521a71) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: make it possible for values in vars and defines to have colons (:)

  Prior to this change, passing --define someKey:https://some-value.com would result in an incomplete value being passed to the Worker.

  This change correctly handles colons for var and define in `wrangler dev` and `wrangler publish`.

* [#2032](https://github.com/cloudflare/workers-sdk/pull/2032) [`f33805d2`](https://github.com/cloudflare/workers-sdk/commit/f33805d28b23b613f03169726b91ac3b1b3428d5) Thanks [@caass](https://github.com/caass)! - Catch unsupported terminal errors and provide a nicer error message.

  Wrangler depends on terminals supporting [raw mode](https://en.wikipedia.org/wiki/Terminal_mode). Previously, attempting to run wrangler from a terminal that didn't support raw mode would result in
  an Ink error, which was both an exposure of an internal implementation detail to the user and also not actionable:

  ```text
    ERROR Raw mode is not supported on the current process.stdin, which Ink uses
         as input stream by default.
         Read about how to prevent this error on
         https://github.com/vadimdemedes/ink/#israwmodesupported
  ```

  Now, we provide a much nicer error, which provides an easy next step for th user:

  ```text

  ERROR: This terminal doesn't support raw mode.

  Wrangler uses raw mode to read user input and write output to the terminal, and won't function correctly without it.

  Try running your previous command in a terminal that supports raw mode, such as Command Prompt or Powershell.
  ```

  Closes #1992

- [#1946](https://github.com/cloudflare/workers-sdk/pull/1946) [`7716c3b9`](https://github.com/cloudflare/workers-sdk/commit/7716c3b9dfed540d7ddfec90f042e870a262be78) Thanks [@penalosa](https://github.com/penalosa)! - Support subdomains with wrangler dev for routes defined with `zone_name` (instead of just for routes defined with `zone_id`)

## 2.1.11

### Patch Changes

- [#1957](https://github.com/cloudflare/workers-sdk/pull/1957) [`b579c2b5`](https://github.com/cloudflare/workers-sdk/commit/b579c2b5ad8dc1d19e1b4bf7ff11f56d0c8d4e1f) Thanks [@caass](https://github.com/caass)! - Remove dependency on create-cloudflare.

  Previously, `wrangler generate` was a thin wrapper around [`create-cloudflare`](https://github.com/cloudflare/templates/tree/main/packages/create-cloudflare). Now, we've moved over the logic from that package directly into `wrangler`.

* [#1985](https://github.com/cloudflare/workers-sdk/pull/1985) [`51385e57`](https://github.com/cloudflare/workers-sdk/commit/51385e5740c189ec4854c76307cb9ed821e3712f) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: hide deprecated flags from --help menu

- [#1944](https://github.com/cloudflare/workers-sdk/pull/1944) [`ea54623c`](https://github.com/cloudflare/workers-sdk/commit/ea54623ce2f2f5bc5ac5c48a58730bb3f75afd9c) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - `wrangler pages publish` should prioritize `_worker.js` over `/functions` if both exist

* [#1950](https://github.com/cloudflare/workers-sdk/pull/1950) [`daf73fbe`](https://github.com/cloudflare/workers-sdk/commit/daf73fbe03b55631383cdc86a05eac12d2775875) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - `wrangler pages dev` should prioritize `_worker.js`

  When using a `_worker.js` file, the entire `/functions` directory should be ignored – this includes its routing and middleware characteristics. Currently `wrangler pages dev` does the reverse, by prioritizing
  `/functions` over `_worker.js`. These changes fix the current behaviour.

- [#1928](https://github.com/cloudflare/workers-sdk/pull/1928) [`c1722170`](https://github.com/cloudflare/workers-sdk/commit/c1722170e93101a292a3c14110b131457f7164d6) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Allow unsetting of automatically generated `Link` headers using `_headers` and the `! Link` operator

* [#1928](https://github.com/cloudflare/workers-sdk/pull/1928) [`c1722170`](https://github.com/cloudflare/workers-sdk/commit/c1722170e93101a292a3c14110b131457f7164d6) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Only generate `Link` headers from simple `<link>` elements.

  Specifically, only those with the `rel`, `href` and possibly `as` attributes. Any element with additional attributes will not be used to generate headers.

- [#1974](https://github.com/cloudflare/workers-sdk/pull/1974) [`a96f2585`](https://github.com/cloudflare/workers-sdk/commit/a96f25856615befef5d03adffd3808a393bf145e) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Bump @cloudflare/pages-shared@0.0.7 and use TS directly

* [#1965](https://github.com/cloudflare/workers-sdk/pull/1965) [`9709d3a3`](https://github.com/cloudflare/workers-sdk/commit/9709d3a31d4fc192c257d0347f111dec465fd20c) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - chore: remove hidden on --from-dash
  The --from-dash can now be used with the dashboard features to support moving Worker developmment to a local machine.

  resolves #1783

- [#1978](https://github.com/cloudflare/workers-sdk/pull/1978) [`6006ae50`](https://github.com/cloudflare/workers-sdk/commit/6006ae5010ab32bbd81b002b26cd450cdf58b1a5) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - chore: Undici 5.11.0 multipart/form-data support
  The 5.11.0 version of Undici now supports multipart/form-data previously needed a ponyfill
  we can now handle the multipart/form-data without any custom code.

  resolves #1977

## 2.1.10

### Patch Changes

- [#1955](https://github.com/cloudflare/workers-sdk/pull/1955) [`b6dd07a1`](https://github.com/cloudflare/workers-sdk/commit/b6dd07a1ba823c45244de18c2ebbe1e3b56c1ed7) Thanks [@cameron-robey](https://github.com/cameron-robey)! - chore: error if d1 bindings used with `no-bundle`

  While in beta, you cannot use D1 bindings without bundling your worker as these are added in through a facade which gets bypassed when using the `no-bundle` option.

* [#1964](https://github.com/cloudflare/workers-sdk/pull/1964) [`1f50578e`](https://github.com/cloudflare/workers-sdk/commit/1f50578ee8f8a007464b7bd4061a5df74488dbc0) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - chore: Emoji space in help description
  Added a space between the Emoji and description for the secret:bulk command.

- [#1967](https://github.com/cloudflare/workers-sdk/pull/1967) [`02261f27`](https://github.com/cloudflare/workers-sdk/commit/02261f27d9d3a6b83087d12b8e653d0039176a83) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: implement remote mode for unstable_dev

  With this change, `unstable_dev` can now perform end-to-end (e2e) tests against your workers as you dev.

  Note that to use this feature in CI, you'll need to configure `CLOUDFLARE_API_TOKEN` as an environment variable in your CI, and potentially add `CLOUDFLARE_ACCOUNT_ID` as an environment variable in your CI, or `account_id` in your `wrangler.toml`.

  Usage:

  ```js
  await unstable_dev("src/index.ts", {
  	local: false,
  });
  ```

## 2.1.9

### Patch Changes

- [#1937](https://github.com/cloudflare/workers-sdk/pull/1937) [`905fce4f`](https://github.com/cloudflare/workers-sdk/commit/905fce4feb0ac34200b597ff5e8c325aaf65b491) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: fails to publish due to empty migrations
  After this change, `wrangler init --from-dash` will not attempt to add durable object migrations to `wrangler.toml` for Workers that don't have durable objects.

  fixes #1854

* [#1943](https://github.com/cloudflare/workers-sdk/pull/1943) [`58a430f2`](https://github.com/cloudflare/workers-sdk/commit/58a430f27fb683f422e552f7c26338f950f39c2b) Thanks [@cameron-robey](https://github.com/cameron-robey)! - chore: add `env` and `ctx` params to `fetch` in javascript example template

  Just like in the typescript templates, and the javascript template for scheduled workers, we include `env` and `ctx` as parameters to the `fetch` export. This makes it clearer where environment variables live.

- [#1934](https://github.com/cloudflare/workers-sdk/pull/1934) [`7ebaec1a`](https://github.com/cloudflare/workers-sdk/commit/7ebaec1a38384b5f04001ad2d8603d7ac0322534) Thanks [@mrbbot](https://github.com/mrbbot)! - Allow `--experimental-local` to be used with module workers

* [#1939](https://github.com/cloudflare/workers-sdk/pull/1939) [`5854cb69`](https://github.com/cloudflare/workers-sdk/commit/5854cb6918cd0271683b4f3f62987f3e9e4b3300) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: respect variable binding type when printing

  After this change, when printing the bindings it has access to, wrangler will correctly only add quotes around string variables, and serialize objects via JSON.stringify (rather than printing `"[object Object]"`).

- [#1953](https://github.com/cloudflare/workers-sdk/pull/1953) [`20195479`](https://github.com/cloudflare/workers-sdk/commit/20195479c9f57d9fede1f5924f6a4ab36f860bea) Thanks [@mrbbot](https://github.com/mrbbot)! - Add `--experimental-local` support to `unstable_dev`

* [#1930](https://github.com/cloudflare/workers-sdk/pull/1930) [`56798155`](https://github.com/cloudflare/workers-sdk/commit/5679815521d7e62d24866eee1653ba409a53e12b) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: use node http instead of faye-websocket in proxy server

  We change how websockets are handled in the proxy server, fixing multiple issues of websocket behaviour, particularly to do with headers.

  In particular this fixes:

  - the protocol passed between the client and the worker was being stripped out by wrangler
  - wrangler was discarding additional headesr from websocket upgrade response
  - websocket close code and reason was not being propagated by wrangler

## 2.1.8

### Patch Changes

- [#1894](https://github.com/cloudflare/workers-sdk/pull/1894) [`ed646cf9`](https://github.com/cloudflare/workers-sdk/commit/ed646cf902a86f467ec2ed08545ced3f97468d31) Thanks [@mrbbot](https://github.com/mrbbot)! - Add experimental support for using the open-source Workers runtime [`workerd`](https://github.com/cloudflare/workerd) in `wrangler dev`.
  Use `wrangler dev --experimental-local` to try it out! 🚀
  Note this feature is still under active development.

## 2.1.7

### Patch Changes

- [#1881](https://github.com/cloudflare/workers-sdk/pull/1881) [`6ff5a030`](https://github.com/cloudflare/workers-sdk/commit/6ff5a0308b8f65f0422719ede3a2a4863311d3d9) Thanks [@Skye-31](https://github.com/Skye-31)! - Chore: correctly log all listening ports on remote mode (closes #1652)

* [#1913](https://github.com/cloudflare/workers-sdk/pull/1913) [`9f7cc5a0`](https://github.com/cloudflare/workers-sdk/commit/9f7cc5a06a704ff2320d0a1996baf6a1da7845a4) Thanks [@threepointone](https://github.com/threepointone)! - feat: expose port and address on (Unstable)DevWorker

  when using `unstable_dev()`, I think we want to expose the port/address that the server has started on. The usecase is when trying to connect to the server _without_ calling `.fetch()` (example: when making a websocket connection).

- [#1911](https://github.com/cloudflare/workers-sdk/pull/1911) [`16c28502`](https://github.com/cloudflare/workers-sdk/commit/16c28502593c27a1b372d8056a55cdee32b5c4cf) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: put config cache log behind logger.debug

  Prior to this change, wrangler would print `Retrieving cached values for...` after almost every single command.

  After this change, you'll only see this message if you add `WRANGLER_LOG=debug` before your command.

  Closes #1808

* [#1687](https://github.com/cloudflare/workers-sdk/pull/1687) [`28cd7361`](https://github.com/cloudflare/workers-sdk/commit/28cd7361a6386913b62389705c335dd1b12d1dd6) Thanks [@geelen](https://github.com/geelen)! - Wrangler now supports the beta release of D1.

## 2.1.6

### Patch Changes

- [#1890](https://github.com/cloudflare/workers-sdk/pull/1890) [`5a4c7113`](https://github.com/cloudflare/workers-sdk/commit/5a4c7113bd34753f571d7c7984658c8b3bb033e0) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: add missing noBundle type to api/dev

* [#1895](https://github.com/cloudflare/workers-sdk/pull/1895) [`1b53bf9d`](https://github.com/cloudflare/workers-sdk/commit/1b53bf9d06fbe2afbd43c18b6406e59e85618dc3) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: rename keep_bindings to keep_vars, and make it opt-in, to keep wrangler.toml compatible with being used for Infrastructure as Code

  By default, wrangler.toml is the source of truth for your environment configuration, like a terraform file.

  If you change your settings (particularly your vars) in the dashboard, wrangler _will_ override them. If you want to disable this behavior, set this field to true.

  Between wrangler 2.0.28 and 2.1.5, by default wrangler would _not_ delete your vars by default, breaking expected wrangler.toml behaviour.

- [#1889](https://github.com/cloudflare/workers-sdk/pull/1889) [`98f756c7`](https://github.com/cloudflare/workers-sdk/commit/98f756c7dfcdefaf1426b6770d0c0450ce4a8619) Thanks [@penalosa](https://github.com/penalosa)! - fix: Correctly place the `.wrangler/state` local state directory in the same directory as `wrangler.toml` by default

* [#1886](https://github.com/cloudflare/workers-sdk/pull/1886) [`8b647175`](https://github.com/cloudflare/workers-sdk/commit/8b647175d31716ef5ff6f801bfd9ed47e2af4bcc) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: potential missing compatibility_date in wrangler.toml when running `wrangler init --from-dash`
  Fixed a bug where compatibility_date wasn't being added to wrangler.toml when initializing a worker via `wrangler init --from-dash`

  fixes #1855

## 2.1.5

### Patch Changes

- [#1819](https://github.com/cloudflare/workers-sdk/pull/1819) [`d8a18070`](https://github.com/cloudflare/workers-sdk/commit/d8a18070c5abe5d9e62da4d5adab794626156ab3) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Adds support for custom \_routes.json when running `wrangler pages dev`

* [#1815](https://github.com/cloudflare/workers-sdk/pull/1815) [`d8fe95d2`](https://github.com/cloudflare/workers-sdk/commit/d8fe95d252a4fd8da5d65eacc32c3be49fca212d) Thanks [@cameron-robey](https://github.com/cameron-robey)! - feat: testing scheduled events with `wrangler dev` remote mode

  Using the new middleware (https://github.com/cloudflare/workers-sdk/pull/1735), we implement a way of testing scheduled workers from a fetch using `wrangler dev` in remote mode, by passing a new command line flag `--test-scheduled`. This exposes a route `/__scheduled` which will trigger the scheduled event.

  ```sh
  $ npx wrangler dev index.js --test-scheduled

  $ curl http://localhost:8787/__scheduled
  ```

  Closes https://github.com/cloudflare/workers-sdk/issues/570

- [#1801](https://github.com/cloudflare/workers-sdk/pull/1801) [`07fc90d6`](https://github.com/cloudflare/workers-sdk/commit/07fc90d60912d6906a4b419db8cefc501e693473) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: multi-worker testing

  This change introduces the ability to test multi-worker setups via the wrangler API's [unstable_dev](https://developers.cloudflare.com/workers/wrangler/api/#unstable_dev) function.

  Usage:

  ```js
  import { unstable_dev } from "wrangler";

  describe("multi-worker testing", () => {
  	let childWorker;
  	let parentWorker;

  	beforeAll(async () => {
  		childWorker = await unstable_dev(
  			"src/child-worker.js",
  			{ config: "src/child-wrangler.toml" },
  			{ disableExperimentalWarning: true }
  		);
  		parentWorker = await unstable_dev(
  			"src/parent-worker.js",
  			{ config: "src/parent-wrangler.toml" },
  			{ disableExperimentalWarning: true }
  		);
  	});

  	afterAll(async () => {
  		await childWorker.stop();
  		await parentWorker.stop();
  	});

  	it("childWorker should return Hello World itself", async () => {
  		const resp = await childWorker.fetch();
  		if (resp) {
  			const text = await resp.text();
  			expect(text).toMatchInlineSnapshot(`"Hello World!"`);
  		}
  	});

  	it("parentWorker should return Hello World by invoking the child worker", async () => {
  		const resp = await parentWorker.fetch();
  		if (resp) {
  			const parsedResp = await resp.text();
  			expect(parsedResp).toEqual("Parent worker sees: Hello World!");
  		}
  	});
  });
  ```

* [#1865](https://github.com/cloudflare/workers-sdk/pull/1865) [`adfc52d6`](https://github.com/cloudflare/workers-sdk/commit/adfc52d6961ca3a43c846d7bce62a5864a80b373) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - polish: loglevel flag
  Added a '--log-level' flag that allows the user to specify between 'debug', 'info', 'log', 'warning', 'error', 'none'
  Currently 'none' will turn off all outputs in Miniflare (local mode), however, Wrangler will still output Errors.

  resolves #185

- [#1861](https://github.com/cloudflare/workers-sdk/pull/1861) [`3d51d553`](https://github.com/cloudflare/workers-sdk/commit/3d51d5536d1c125142bfea1879609411905051ce) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Add 'charset' to 'Content-Type' on 'wrangler pages dev' responses

* [#1867](https://github.com/cloudflare/workers-sdk/pull/1867) [`5a6ccc58`](https://github.com/cloudflare/workers-sdk/commit/5a6ccc584dffcbc0ae176bed7102dda8e50cdbea) Thanks [@cameron-robey](https://github.com/cameron-robey)! - fix: handle logging of empty map/set/weak-map/weak-set

- [#1882](https://github.com/cloudflare/workers-sdk/pull/1882) [`ba0aed63`](https://github.com/cloudflare/workers-sdk/commit/ba0aed63903d88ca2111084558625935cf7daddb) Thanks [@rozenmd](https://github.com/rozenmd)! - chore: refactor remote.tsx to only destructure when necessary

## 2.1.4

### Patch Changes

- [#1843](https://github.com/cloudflare/workers-sdk/pull/1843) [`c5ee6dee`](https://github.com/cloudflare/workers-sdk/commit/c5ee6deec547a69dc092cbcda2df212a6836013f) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: teach wrangler init how to write js tests

* [#1856](https://github.com/cloudflare/workers-sdk/pull/1856) [`6aae958a`](https://github.com/cloudflare/workers-sdk/commit/6aae958aafc7a2a5be8853214438bc7c1ccda939) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: add vitest as a test runner option

- [#1839](https://github.com/cloudflare/workers-sdk/pull/1839) [`2660872a`](https://github.com/cloudflare/workers-sdk/commit/2660872a391b6c4662889bfdd5fda035f48ca54d) Thanks [@cameron-robey](https://github.com/cameron-robey)! - feat: make it possible to specify a path for `unstable_dev()`'s fetch method

  ```
  const worker = await unstable_dev(
    "script.js"
  );
  const res = await worker.fetch(req);
  ```

  where `req` can be anything from `RequestInfo`: `string | URL | Request`.

* [#1851](https://github.com/cloudflare/workers-sdk/pull/1851) [`afca1b6c`](https://github.com/cloudflare/workers-sdk/commit/afca1b6c47933ddb22ccb3317fbd4976c5b926c8) Thanks [@cameron-robey](https://github.com/cameron-robey)! - feat: summary output for secret:bulk

  When wrangler `secret:bulk <json>` is run, a summary is outputted at the end with the number of secrets successfully / unsuccessfully created.

- [#1847](https://github.com/cloudflare/workers-sdk/pull/1847) [`5726788f`](https://github.com/cloudflare/workers-sdk/commit/5726788fa1b50765c8455c98f508acffad6ca588) Thanks [@rozenmd](https://github.com/rozenmd)! - chore: add instructions as part of wrangler init for testing

* [#1846](https://github.com/cloudflare/workers-sdk/pull/1846) [`f450e387`](https://github.com/cloudflare/workers-sdk/commit/f450e387f61cf7e28b84fefd018d9758b7b2c931) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: when running `wrangler init`, add a `test` script to package.json when the user asks us to write their first test

- [#1837](https://github.com/cloudflare/workers-sdk/pull/1837) [`aa5ede62`](https://github.com/cloudflare/workers-sdk/commit/aa5ede624d9b9465dbe80cdfe2b21b85a8a217ba) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: explicitly export UnstableDevWorker type

* [#1779](https://github.com/cloudflare/workers-sdk/pull/1779) [`974f3311`](https://github.com/cloudflare/workers-sdk/commit/974f3311145175f77baacbf0b41fd81865c99159) Thanks [@WalshyDev](https://github.com/WalshyDev)! - Add debug outputs to the exchange request

## 2.1.3

### Patch Changes

- [#1836](https://github.com/cloudflare/workers-sdk/pull/1836) [`3583f313`](https://github.com/cloudflare/workers-sdk/commit/3583f313f50d1b0ba703286a44842d1c70b730e9) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: wrangler publish for CI after a manual deployment

  Prior to this change, if you edited your Worker via the Cloudflare Dashboard, then used CI to deploy your script, `wrangler publish` would fail.

  This change logs a warning that your manual changes are going to be overriden, but doesn't require user input to proceed.

  Closes #1832

* [#1644](https://github.com/cloudflare/workers-sdk/pull/1644) [`dc1c9595`](https://github.com/cloudflare/workers-sdk/commit/dc1c959548b41c617dd220ff3b222c076b62ea78) Thanks [@geelen](https://github.com/geelen)! - Deprecated --experimental-enable-local-persistence.

  Added --persist and --persist-to in its place. Changed the default persistence directory to .wrangler/state, relative to wrangler.toml.

  To migrate to the new flag, run `mkdir -p .wrangler && mv wrangler-local-state .wrangler/state` then use `--persist`. Alternatively, you can use `--persist-to=./wrangler-local-state` to keep using the files in the old location.

## 2.1.2

### Patch Changes

- [#1833](https://github.com/cloudflare/workers-sdk/pull/1833) [`b1622395`](https://github.com/cloudflare/workers-sdk/commit/b1622395641057b1eda0d165951fd9079036fefc) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: \_headers and \_redirects parsing in 'wrangler pages dev'

## 2.1.1

### Patch Changes

- [#1827](https://github.com/cloudflare/workers-sdk/pull/1827) [`32a58fee`](https://github.com/cloudflare/workers-sdk/commit/32a58fee8efd2c0c07dcb75ad5e52cbca8785b12) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: Publish error when deploying new Workers

  This fix adds a try/catch when checking when the Worker was last deployed.

  The check was failing when a Worker had never been deployed, causing deployments of new Workers to fail.

  fixes #1824

* [#1799](https://github.com/cloudflare/workers-sdk/pull/1799) [`a89786ba`](https://github.com/cloudflare/workers-sdk/commit/a89786ba3b08a7cd7c074c52b6b83ab91223dddf) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: Bulk Secret Upload
  Created a flag that allows for passing in a JSON file with key/value's of secrets.

  resolve #1610

## 2.1.0

### Minor Changes

- [#1713](https://github.com/cloudflare/workers-sdk/pull/1713) [`82451e9d`](https://github.com/cloudflare/workers-sdk/commit/82451e9dbb12447f487904788a6e82b184c83722) Thanks [@jspspike](https://github.com/jspspike)! - Tail now uses updated endpoint. Allows tailing workers that are above the normal "invocations per second" limit when using the `--ip self` filter.

### Patch Changes

- [#1745](https://github.com/cloudflare/workers-sdk/pull/1745) [`1a13e483`](https://github.com/cloudflare/workers-sdk/commit/1a13e483398fb13239c3a5a58efbf4b30c47857e) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: let users know when we'll use their proxy for requests

* [#1782](https://github.com/cloudflare/workers-sdk/pull/1782) [`cc43e3c4`](https://github.com/cloudflare/workers-sdk/commit/cc43e3c491aef432a52c15f43ecd4005c1400211) Thanks [@jahands](https://github.com/jahands)! - fix: Update Pages test to assert version in package.json

  This test was asserting a hardcoded wrangler version which broke after release.

- [#1786](https://github.com/cloudflare/workers-sdk/pull/1786) [`1af49b68`](https://github.com/cloudflare/workers-sdk/commit/1af49b68d3189b8ded0d53a2a88cf08d792abf2a) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: refactor unstable_dev to avoid race conditions with ports

  Prior to this change, wrangler would check to see if a port was available, do a bit more work, then try use that port when starting miniflare. With this change, we're using port 0 to tell Node to assign us a random free port.

  To make this change work, we had to do some plumbing so miniflare can tell us the host and port it's using, so we can call fetch against it.

* [#1795](https://github.com/cloudflare/workers-sdk/pull/1795) [`c17f6d3d`](https://github.com/cloudflare/workers-sdk/commit/c17f6d3d1efee7bbaa4de48dc01ff6b7b1f40c1e) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to [`2.8`](https://github.com/cloudflare/miniflare/releases/tag/v2.8.0)

- [#1788](https://github.com/cloudflare/workers-sdk/pull/1788) [`152a1e81`](https://github.com/cloudflare/workers-sdk/commit/152a1e81cb6967a701973faaf85ddc03404b866a) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Refactor 'wrangler pages dev' to use the same code as we do in production

  This will make our dev implementation an even closer simulation of production, and will make maintenance easier going forward.

* [#1789](https://github.com/cloudflare/workers-sdk/pull/1789) [`b21ee41a`](https://github.com/cloudflare/workers-sdk/commit/b21ee41ae66d739f2db496a73acfcbf57ef45c0e) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: getMonth compatibility date
  Set correct month for `compatibility_date` when initializing a new Worker

  resolves #1766

- [#1694](https://github.com/cloudflare/workers-sdk/pull/1694) [`3fb730a3`](https://github.com/cloudflare/workers-sdk/commit/3fb730a33d36bbb6a4270c8d4a3a80fd506a9ad1) Thanks [@yjl9903](https://github.com/yjl9903)! - feat: starting pages dev server doesn't require command when proxy port provided

* [#1729](https://github.com/cloudflare/workers-sdk/pull/1729) [`ebb5b88f`](https://github.com/cloudflare/workers-sdk/commit/ebb5b88fbcba30fca3beb3900c2429218aad5ed2) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: autogenerated config from dash

  Makes `wrangler init`'s `--from-dash` option pull in data from Cloudflare's dashboard to generate a wrangler.toml file populated with configuration from an existing Worker.
  This is a first step towards making `wrangler init` more useful for folks who are already using Cloudflare's products on the Dashboard.

  related discussion #1623
  resolves #1638

- [#1781](https://github.com/cloudflare/workers-sdk/pull/1781) [`603d0b35`](https://github.com/cloudflare/workers-sdk/commit/603d0b35074e2c59484e39305e0b01121de20f15) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: Publish Origin Messaging
  feat: warn about potential conflicts during `publish` and `init --from-dash`.

  - If publishing to a worker that has been modified in the dashboard, warn that the dashboard changes will be overwritten.
  - When initializing from the dashboard, warn that future changes via the dashboard will not automatically appear in the local Worker config.

  resolves #1737

* [#1735](https://github.com/cloudflare/workers-sdk/pull/1735) [`de29a445`](https://github.com/cloudflare/workers-sdk/commit/de29a4459750cf229fb563bcc8191ab3ad77bf4d) Thanks [@cameron-robey](https://github.com/cameron-robey)! - feat: new internal middleware

  A new way of registering middleware that gets bundled and executed on the edge.

  - the same middleware functions can be used for both modules workers and service workers
  - only requires running esbuild a fixed number of times, rather than for each middleware added

## 2.0.29

### Patch Changes

- [#1731](https://github.com/cloudflare/workers-sdk/pull/1731) [`16f051d3`](https://github.com/cloudflare/workers-sdk/commit/16f051d36e8c205374e5ac38b141def45095e3ef) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Add custom \_routes.json support for Pages Functions projects

* [#1762](https://github.com/cloudflare/workers-sdk/pull/1762) [`23f89216`](https://github.com/cloudflare/workers-sdk/commit/23f8921628baf32f0cace1ebf893964a26afe91a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Use getBasePath() when trying to specify paths to files relative to the
  base of the Wrangler package directory rather than trying to compute the
  path from Node.js constants like **dirname and **filename. This is
  because the act of bundling the source code can move the file that contains
  these constants around potentially breaking the relative path to the desired files.

  Fixes #1755

- [#1763](https://github.com/cloudflare/workers-sdk/pull/1763) [`75f3ae82`](https://github.com/cloudflare/workers-sdk/commit/75f3ae829b0b4f8ae2cf2093bda93e8096838240) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Add `description` field to \_routes.json

  When generating routes for Functions projects, let's add a description
  so we know what wrangler version generated this config

* [#1538](https://github.com/cloudflare/workers-sdk/pull/1538) [`2c9caf74`](https://github.com/cloudflare/workers-sdk/commit/2c9caf74bdf3f60db7c244b2202f358abe5ced1f) Thanks [@rozenmd](https://github.com/rozenmd)! - chore: refactor wrangler.dev API to not need React/Ink

  Prior to this change, `wrangler.unstable_dev()` would only support running one instance of wrangler at a time, as Ink only lets you render one instance of React. This resulted in test failures in CI.

  This change creates pure JS/TS versions of these React hooks:

  - useEsbuild
  - useLocalWorker
  - useCustomBuild
  - useTmpDir

  As a side-effect of removing React, tests should run faster in CI.

  Closes #1432
  Closes #1419

- [#1775](https://github.com/cloudflare/workers-sdk/pull/1775) [`8163b8cf`](https://github.com/cloudflare/workers-sdk/commit/8163b8cfde8020d76bd64090276347b01b4a8f8d) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Add unit tests for `wrangler pages publish`

## 2.0.28

### Patch Changes

- [#1725](https://github.com/cloudflare/workers-sdk/pull/1725) [`eb75413e`](https://github.com/cloudflare/workers-sdk/commit/eb75413ec35f6d4f6306601f4d5c9d058f794a18) Thanks [@threepointone](https://github.com/threepointone)! - rename: `worker_namespaces` / `dispatch_namespaces`

  The Worker-for-Platforms team would like to rename this field to more closely match what it's called internally. This fix does a search+replace on this term. This feature already had an experimental warning, and no one's using it at the moment, so we're not going to add a warning/backward compat for existing customers.

* [#1736](https://github.com/cloudflare/workers-sdk/pull/1736) [`800f8553`](https://github.com/cloudflare/workers-sdk/commit/800f8553b25bb0641fd5e9b38eb5d9ca02abe24c) Thanks [@threepointone](https://github.com/threepointone)! - fix: do not delete previously defined plain_text/json bindings on publish

  Currently, when we publish a worker, we delete an pre-existing bindings if they're not otherwise defined in `wrangler.toml`, and overwrite existing ones. But folks may be deploying with wrangler, and changing environment variables on the fly (like marketing messages, etc). It's annoying when deploying via wrangler blows away those values.

  This patch fixes one of those issues. It will not delete any older bindings that are not in wrangler.toml. It still _does_ overwrite existing vars, but at least this gives a way for developers to have some vars that are not blown away on every publish.

- [#1726](https://github.com/cloudflare/workers-sdk/pull/1726) [`0b83504c`](https://github.com/cloudflare/workers-sdk/commit/0b83504c12b35301acaeb5302c0d16021c958f8e) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Multiworker and static asset dev bug preventing both from being used

  There was previously a collision on the generated filenames which resulted in the generated scripts looping and crashing in Miniflare with error code 7. By renaming one of the generated files, this is avoided.

* [#1718](https://github.com/cloudflare/workers-sdk/pull/1718) [`02f1fe9b`](https://github.com/cloudflare/workers-sdk/commit/02f1fe9b07bb08b7395e7de1d78cc929221b464f) Thanks [@threepointone](https://github.com/threepointone)! - fix: use `config.dev.ip` when provided

  Because we'd used a default for 0.0.0.0 for the `--ip` flag, `wrangler dev` was overriding the value specified in `wrangler.toml` under `dev.ip`. This fix removes the default value (since it's being set when normalising config anyway).

  Fixes https://github.com/cloudflare/workers-sdk/issues/1714

- [#1727](https://github.com/cloudflare/workers-sdk/pull/1727) [`3f9e8f63`](https://github.com/cloudflare/workers-sdk/commit/3f9e8f634e6544bf3aef8748f56041a077758ab2) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: refresh token when we detect that the preview session has expired (error code 10049)

  When running `wrangler dev`, from time to time the preview session token would expire, and the dev server would need to be manually restarted. This fixes this, by refreshing the token when it expires.

  Closes #1446

* [#1730](https://github.com/cloudflare/workers-sdk/pull/1730) [`27ad80ee`](https://github.com/cloudflare/workers-sdk/commit/27ad80eed7f25393a0e5c1d8a62c3b0e743a639d) Thanks [@threepointone](https://github.com/threepointone)! - feat: `--var name:value` and `--define name:value`

  This enables passing values for `[vars]` and `[define]` via the cli. We have a number of usecases where the values to be injected during dev/publish aren't available statically (eg: a version string, some identifier for 3p libraries, etc) and reading those values only from `wrangler.toml` isn't good ergonomically. So we can now read those values when passed through the CLI.

  Example: add a var during dev: `wrangler dev --var xyz:123` will inject the var `xyz` with string `"123"`

  (note, only strings allowed for `--var`)

  substitute a global value: `wrangler dev --define XYZ:123` will replace every global identifier `XYZ` with the value `123`.

  The same flags also work with `wrangler publish`.

  Also, you can use actual environment vars in these commands. e.g.: `wrangler dev --var xyz:$XYZ` will set `xyz` to whatever `XYZ` has been set to in the terminal environment.

- [#1700](https://github.com/cloudflare/workers-sdk/pull/1700) [`d7c23e49`](https://github.com/cloudflare/workers-sdk/commit/d7c23e49706cb8fdb6eb71ece9fb4eca14c62df8) Thanks [@penalosa](https://github.com/penalosa)! - Closes [#1505](https://github.com/cloudflare/workers-sdk/issues/1505) by extending `wrangler tail` to allow for passing worker routes as well as worker script names.

  For example, if you have a worker `example-worker` assigned to the route `example.com/*`, you can retrieve it's logs by running either `wrangler tail example.com/*` or `wrangler tail example-worker`—previously only `wrangler tail example-worker` was supported.

* [#1720](https://github.com/cloudflare/workers-sdk/pull/1720) [`f638de64`](https://github.com/cloudflare/workers-sdk/commit/f638de6426619a899367ba41674179b8ca67c6ab) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to [`2.7.1`](https://github.com/cloudflare/miniflare/releases/tag/v2.7.1) incorporating changes from [`2.7.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.7.0)

- [#1691](https://github.com/cloudflare/workers-sdk/pull/1691) [`5b2c3ee2`](https://github.com/cloudflare/workers-sdk/commit/5b2c3ee2c5d65b25c966ca07751f544f282525b9) Thanks [@cameron-robey](https://github.com/cameron-robey)! - chore: bump undici and increase minimum node version to 16.13

  - We bump undici to version to 5.9.1 to patch some security vulnerabilities in previous versions
  - This requires bumping the minimum node version to >= 16.8 so we update the minimum to the LTS 16.13

  Fixes https://github.com/cloudflare/workers-sdk/issues/1679
  Fixes https://github.com/cloudflare/workers-sdk/issues/1684

## 2.0.27

### Patch Changes

- [#1686](https://github.com/cloudflare/workers-sdk/pull/1686) [`a0a3ffde`](https://github.com/cloudflare/workers-sdk/commit/a0a3ffde4a2388cfa2c6d2fa13b4c0ee94a172ba) Thanks [@Skye-31](https://github.com/Skye-31)! - fix: pages dev correctly escapes regex characters in function paths (fixes #1685)

* [#1667](https://github.com/cloudflare/workers-sdk/pull/1667) [`ba6451df`](https://github.com/cloudflare/workers-sdk/commit/ba6451dfe888580aa7d8d33c2c770a5d3d57667d) Thanks [@arjunyel](https://github.com/arjunyel)! - fix: check for nonempty kv id and r2 bucket_name

- [#1628](https://github.com/cloudflare/workers-sdk/pull/1628) [`61e3f00b`](https://github.com/cloudflare/workers-sdk/commit/61e3f00bcb017b7ea96bb0c12459c56539fb891a) Thanks [@Skye-31](https://github.com/Skye-31)! - fix: pages dev process exit when proxied process exits

  Currently, if the process pages dev is proxying exists or crashes, pages dev does not clean it up, and attempts to continue proxying requests to it, resulting in it throwing 502 errors. This fixes that behaviour to make wrangler exit with the code the child_process exits with.

* [#1690](https://github.com/cloudflare/workers-sdk/pull/1690) [`670fa778`](https://github.com/cloudflare/workers-sdk/commit/670fa778db263a3cf81b2b1d572dcb0df96a0463) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: check if we're in CI before trying to open the browser

- [#1675](https://github.com/cloudflare/workers-sdk/pull/1675) [`ee30101d`](https://github.com/cloudflare/workers-sdk/commit/ee30101db59b195dba734fcbd479ec1aeae1feab) Thanks [@Skye-31](https://github.com/Skye-31)! - chore: use rimraf & cross-env to support windows development

* [#1710](https://github.com/cloudflare/workers-sdk/pull/1710) [`9943e647`](https://github.com/cloudflare/workers-sdk/commit/9943e647c56c686d0e499c28b3c54b4fbe47dccb) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: pass create-cloudflare the correct path

  wrangler generate was passing create-cloudflare an absolute path, rather than a folder name, resulting in "doubled-up" paths

- [#1712](https://github.com/cloudflare/workers-sdk/pull/1712) [`c18c60ee`](https://github.com/cloudflare/workers-sdk/commit/c18c60eeacca27656f0e21f1bdcfc0e1298343c3) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add debug logging to CF API requests and remote dev worker requests

* [#1663](https://github.com/cloudflare/workers-sdk/pull/1663) [`a9f9094c`](https://github.com/cloudflare/workers-sdk/commit/a9f9094c92e547c1db7cd45fb5bc46f933f75e39) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Adds `--compatibility-date` and `--compatibility-flags` to `wrangler pages dev`

  Soon to follow in production.

- [#1653](https://github.com/cloudflare/workers-sdk/pull/1653) [`46b73b52`](https://github.com/cloudflare/workers-sdk/commit/46b73b5227ddbcc0ce53feb1c13845044474c86c) Thanks [@WalshyDev](https://github.com/WalshyDev)! - Fixed R2 create bucket API endpoint. The `wrangler r2 bucket create` command should work again

## 2.0.26

### Patch Changes

- [#1655](https://github.com/cloudflare/workers-sdk/pull/1655) [`fed80faa`](https://github.com/cloudflare/workers-sdk/commit/fed80faa9d704d7d840d65a7dfc57805ff9356d7) Thanks [@jahands](https://github.com/jahands)! - fix: Pages Functions custom \_routes.json not being used

  Also cleaned up when we were reading generated \_routes.json

* [#1649](https://github.com/cloudflare/workers-sdk/pull/1649) [`a366b12f`](https://github.com/cloudflare/workers-sdk/commit/a366b12f6af1593a5d060ad83338397a6047d329) Thanks [@Skye-31](https://github.com/Skye-31)! - fix: [windows] unable to find netstat

- [#1626](https://github.com/cloudflare/workers-sdk/pull/1626) [`f650a0b2`](https://github.com/cloudflare/workers-sdk/commit/f650a0b2be8f725d5e71520f89fe848bb1379194) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: Added pathname to the constructed URL service bindings + wrangler dev ignores pathname when making a request.

  resolves #1598

* [#1648](https://github.com/cloudflare/workers-sdk/pull/1648) [`af669a19`](https://github.com/cloudflare/workers-sdk/commit/af669a1983a02adc1b997798869b2b4260c10891) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Implement new wrangler pages functions optimize-routes command

- [#1622](https://github.com/cloudflare/workers-sdk/pull/1622) [`02bdfde0`](https://github.com/cloudflare/workers-sdk/commit/02bdfde0d683097d1d1c40d9e3b64011cc8859ef) Thanks [@Skye-31](https://github.com/Skye-31)! - fix: Handle static files with multiple extensions, e.g. /a.b should resolve /a.b.html, if /a.b as a file does not exist

* [#1666](https://github.com/cloudflare/workers-sdk/pull/1666) [`662dfdf9`](https://github.com/cloudflare/workers-sdk/commit/662dfdf9e02056245e0c0ac7464f1c7b83465899) Thanks [@jahands](https://github.com/jahands)! - fix: Consolidate routes that are over the limit to prevent failed deployments

  Rather than failing a deployment because a route is too long (>100 characters), it will now be shortened to the next available level. Eg. `/foo/aaaaaaa...` -> `/foo/*`

- [#1670](https://github.com/cloudflare/workers-sdk/pull/1670) [`1b232aaf`](https://github.com/cloudflare/workers-sdk/commit/1b232aafa7ba192f8cc309d5905d9afdaa4eae78) Thanks [@Skye-31](https://github.com/Skye-31)! - fix: dev.tsx opens 127.0.0.1 instead of 0.0.0.0 (doesn't work on windows)

* [#1671](https://github.com/cloudflare/workers-sdk/pull/1671) [`808c0ab3`](https://github.com/cloudflare/workers-sdk/commit/808c0ab39465c61c8cca532329a56fa4786331b0) Thanks [@Skye-31](https://github.com/Skye-31)! - feat: pages publish - log special files being uploaded

- [#1656](https://github.com/cloudflare/workers-sdk/pull/1656) [`37852672`](https://github.com/cloudflare/workers-sdk/commit/37852672ba14cacfeb780b03f3ea35e82ca1aa1f) Thanks [@jahands](https://github.com/jahands)! - fix: Warn when Pages Functions have no routes

  Building/publishing pages functions with no valid handlers would result in a Functions script containing no routes, often because the user is using the functions directory for something unrelated. This will no longer add an empty Functions script to the deployment, needlessly consuming Functions quota.

* [#1665](https://github.com/cloudflare/workers-sdk/pull/1665) [`c40fca42`](https://github.com/cloudflare/workers-sdk/commit/c40fca421b6826d7f0ef0bf7a8840e4bce7cd062) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Fix SW and Durable Object request URLs made over the service registry

- [#1645](https://github.com/cloudflare/workers-sdk/pull/1645) [`ac397480`](https://github.com/cloudflare/workers-sdk/commit/ac39748069d2d20cb4dfd703b65f2329f60ae4ce) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: download & initialize a wrangler project from dashboard worker

  Added `wrangler init --from-dash <worker-name>`, which allows initializing a wrangler project from a pre-existing worker in the dashboard.

  Resolves #1624
  Discussion: #1623

  Notes: `multiplart/form-data` parsing is [not currently supported in Undici](https://github.com/nodejs/undici/issues/974), so a temporary workaround to slice off top and bottom boundaries is in place.

* [#1639](https://github.com/cloudflare/workers-sdk/pull/1639) [`d86382a5`](https://github.com/cloudflare/workers-sdk/commit/d86382a50fd4a163659cdf745e462f3a9c7159a5) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - fix: support 'exceededMemory' error status in tail

  While the exception for 'Worker exceeded memory limits' gets logged
  correctly when tailing, the actual status wasn't being counted as an
  error, and was falling through a switch case to 'unknown'

  This ensures filtering and logging reflects that status correctly

## 2.0.25

### Patch Changes

- [#1615](https://github.com/cloudflare/workers-sdk/pull/1615) [`9163da17`](https://github.com/cloudflare/workers-sdk/commit/9163da17959532ab801c8dca772e29c135f80cf1) Thanks [@huw](https://github.com/huw)! - fix: Resolve source maps correctly in local dev mode

  Resolves https://github.com/cloudflare/workers-sdk/issues/1614

* [#1617](https://github.com/cloudflare/workers-sdk/pull/1617) [`32c9a4ae`](https://github.com/cloudflare/workers-sdk/commit/32c9a4ae95eb2d6ffecb8f5765ed68b2e9278f4e) Thanks [@jahands](https://github.com/jahands)! - fix: Ignore \_routes.generated.json when uploading Pages assets

- [#1609](https://github.com/cloudflare/workers-sdk/pull/1609) [`fa8cb73f`](https://github.com/cloudflare/workers-sdk/commit/fa8cb73f72e3f167289326ed6a2ce58d42bd9102) Thanks [@jahands](https://github.com/jahands)! - patch: Consolidate redundant routes when generating \_routes.generated.json

  Example: `["/foo/:name", "/foo/bar"] => ["/foo/*"]`

* [#1595](https://github.com/cloudflare/workers-sdk/pull/1595) [`d4fbd0be`](https://github.com/cloudflare/workers-sdk/commit/d4fbd0be5f5801c331a76709cb375a9386117361) Thanks [@caass](https://github.com/caass)! - Add support for Alarm Events in `wrangler tail`

  `wrangler tail --format pretty` now supports receiving events from [Durable Object Alarms](https://developers.cloudflare.com/workers/learning/using-durable-objects/#alarms-in-durable-objects), and will display the time the alarm was triggered.

  Additionally, any future unknown events will simply print "Unknown Event" instead of crashing the `wrangler` process.

  Closes #1519

- [#1642](https://github.com/cloudflare/workers-sdk/pull/1642) [`a3e654f8`](https://github.com/cloudflare/workers-sdk/commit/a3e654f8d98c5ac5bbb5d167ddaf6b8975c383c5) Thanks [@jrf0110](https://github.com/jrf0110)! - feat: Add output-routes-path to functions build

  This controls the output path of the \_routes.json file. Also moves \_routes.json generation to tmp directory during functions build + publish

* [#1606](https://github.com/cloudflare/workers-sdk/pull/1606) [`24327289`](https://github.com/cloudflare/workers-sdk/commit/243272890ece055b1b5a7fdb3eb97200ea686a98) Thanks [@Skye-31](https://github.com/Skye-31)! - chore: make prettier also fix changesets, as it causes checks to fail if they're not formatted

- [#1611](https://github.com/cloudflare/workers-sdk/pull/1611) [`3df0fe04`](https://github.com/cloudflare/workers-sdk/commit/3df0fe043a69492db2a2ebe7098e0355409d3dc6) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Durable Object multi-worker bindings in local dev.

  Building on [the recent work for multi-worker Service bindings in local dev](https://github.com/cloudflare/workers-sdk/pull/1503), this now adds support for direct Durable Object namespace bindings.

  A parent (calling) Worker will look for child Workers (where the Durable Object has been defined) by matching the `script_name` configuration option with the child's Service name. For example, if you have a Worker A which defines a Durable Object, `MyDurableObject`, and Worker B which references A's Durable Object:

  ```toml
  name = "A"

  [durable_objects]
  bindings = [
  	{ name = "MY_DO", class_name = "MyDurableObject" }
  ]
  ```

  ```toml
  name = "B"

  [durable_objects]
  bindings = [
  	{ name = "REFERENCED_DO", class_name = "MyDurableObject", script_name = "A" }
  ]
  ```

  `MY_DO` will work as normal in Worker A. `REFERENCED_DO` in Worker B will point at A's Durable Object.

  Note: this only works in local mode (`wrangler dev --local`) at present.

* [#1621](https://github.com/cloudflare/workers-sdk/pull/1621) [`2aa3fe88`](https://github.com/cloudflare/workers-sdk/commit/2aa3fe884422671ba128ea01a37abf63d344e541) Thanks [@Skye-31](https://github.com/Skye-31)! - fix(#1487) [pages]: Command failed: git rev-parse --abrev-ref HEAD

- [#1631](https://github.com/cloudflare/workers-sdk/pull/1631) [`f1c97c8b`](https://github.com/cloudflare/workers-sdk/commit/f1c97c8ba07d1b346bbd12e05503007b8e6ec912) Thanks [@Skye-31](https://github.com/Skye-31)! - chore: add fixtures to prettier

* [#1602](https://github.com/cloudflare/workers-sdk/pull/1602) [`ebd1d631`](https://github.com/cloudflare/workers-sdk/commit/ebd1d631915fb2041886aad8ee398d5c9e0f612e) Thanks [@huw](https://github.com/huw)! - fix: Pass `usageModel` to Miniflare in local dev

  This allows Miniflare to dynamically update the external subrequest limit for Unbound workers.

- [#1629](https://github.com/cloudflare/workers-sdk/pull/1629) [`06915ff7`](https://github.com/cloudflare/workers-sdk/commit/06915ff780c7333a2f979b042b4c20eed1338b37) Thanks [@Skye-31](https://github.com/Skye-31)! - fix: disallow imports in \_worker.js (https://github.com/cloudflare/workers-sdk/issues/1214)

* [#1518](https://github.com/cloudflare/workers-sdk/pull/1518) [`85ab8a93`](https://github.com/cloudflare/workers-sdk/commit/85ab8a9389de8d77b1d08b2cf14a5c7b5d493e07) Thanks [@jahands](https://github.com/jahands)! - feature: Reduce Pages Functions executions for Asset-only requests in `_routes.json`

  Manually create a `_routes.json` file in your build output directory to specify routes. This is a set of inclusion/exclusion rules to indicate when to run a Pages project's Functions. Note: This is an experemental feature and is subject to change.

- [#1634](https://github.com/cloudflare/workers-sdk/pull/1634) [`f6ea7e7b`](https://github.com/cloudflare/workers-sdk/commit/f6ea7e7b48b36e39b11380eb6a14461ebbabc80b) Thanks [@Skye-31](https://github.com/Skye-31)! - feat: [pages] add loaders for .html & .txt

* [#1589](https://github.com/cloudflare/workers-sdk/pull/1589) [`6aa96e49`](https://github.com/cloudflare/workers-sdk/commit/6aa96e490489e5847bae53885b9e5ef3dcff55b7) Thanks [@Skye-31](https://github.com/Skye-31)! - fix routing for URI encoded static requests

- [#1643](https://github.com/cloudflare/workers-sdk/pull/1643) [`4b04a377`](https://github.com/cloudflare/workers-sdk/commit/4b04a3772f170bd0e0b9c0de076acfd5e5fdc3d2) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Add `--inspector-port` argument to `wrangler pages dev`

* [#1641](https://github.com/cloudflare/workers-sdk/pull/1641) [`5f5466ab`](https://github.com/cloudflare/workers-sdk/commit/5f5466abda5929359a3e405a36c39547660cf039) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Add support for using external Durable Objects from `wrangler pages dev`.

  An external Durable Object can be referenced using `npx wrangler pages dev ./public --do MyDO=MyDurableObject@api` where the Durable Object is made available on `env.MyDO`, and is described in a Workers service (`name = "api"`) with the class name `MyDurableObject`.

  You must have the `api` Workers service running in as another `wrangler dev` process elsewhere already in order to reference that object.

- [#1605](https://github.com/cloudflare/workers-sdk/pull/1605) [`9e632cdd`](https://github.com/cloudflare/workers-sdk/commit/9e632cddeace54aa8fbc9695621002889c3daa03) Thanks [@kimyvgy](https://github.com/kimyvgy)! - refactor: add --ip argument for `wrangler pages dev` & defaults IP to `0.0.0.0`

  Add new argument `--ip` for the command `wrangler pages dev`, defaults to `0.0.0.0`. The command `wrangler dev` is also defaulting to `0.0.0.0` instead of `localhost`.

* [#1604](https://github.com/cloudflare/workers-sdk/pull/1604) [`9732fafa`](https://github.com/cloudflare/workers-sdk/commit/9732fafa066d3a18ba6096cfc814a2831f4a7d0e) Thanks [@WalshyDev](https://github.com/WalshyDev)! - Added R2 support for wrangler pages dev. You can add an R2 binding with `--r2 <BINDING>`.

- [#1608](https://github.com/cloudflare/workers-sdk/pull/1608) [`9f02758f`](https://github.com/cloudflare/workers-sdk/commit/9f02758fcd9c7816120a76f357a179a268f45a35) Thanks [@jrf0110](https://github.com/jrf0110)! - feat: Generate \_routes.generated.json for Functions routing

  When using Pages Functions, a \_routes.generated.json file is created to inform Pages how to route requests to a project's Functions Worker.

* [#1603](https://github.com/cloudflare/workers-sdk/pull/1603) [`7ae059b3`](https://github.com/cloudflare/workers-sdk/commit/7ae059b3dcdd9dce5f03110d8ff670022b8ccf02) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: R2 Object Deletequote
  Improving the R2 objects management, added the functionality to delete objects in a bucket.

  resolves #1584

## 2.0.24

### Patch Changes

- [#1577](https://github.com/cloudflare/workers-sdk/pull/1577) [`359d0ba3`](https://github.com/cloudflare/workers-sdk/commit/359d0ba379c7c94fa29c8e1728a2c0a7491749c6) Thanks [@threepointone](https://github.com/threepointone)! - chore: update esbuild to 0.14.51

* [#1558](https://github.com/cloudflare/workers-sdk/pull/1558) [`b43a7f98`](https://github.com/cloudflare/workers-sdk/commit/b43a7f9836e8f2d969624c2c5a88adf374a1ebe3) Thanks [@rozenmd](https://github.com/rozenmd)! - chore: extract devProps parsing into own function

- [#1438](https://github.com/cloudflare/workers-sdk/pull/1438) [`0a9fe918`](https://github.com/cloudflare/workers-sdk/commit/0a9fe918216264a2f6fa3f69dd596f89de7d9f56) Thanks [@caass](https://github.com/caass)! - Initial implementation of `wrangler generate`

  - `wrangler generate` and `wrangler generate <name>` delegate to `wrangler init`.
  - `wrangler generate <name> <template>` delegates to `create-cloudflare`

  Naming behavior is replicated from Wrangler v1, and will auto-increment the
  worker name based on pre-existing directories.

* [#1534](https://github.com/cloudflare/workers-sdk/pull/1534) [`d3ae16cf`](https://github.com/cloudflare/workers-sdk/commit/d3ae16cfb8e13f0e6e5f710b3cb03e46ecb7bf7a) Thanks [@cameron-robey](https://github.com/cameron-robey)! - feat: publish full url on `wrangler publish` for workers.dev workers

  When the url is printed out on `wrangler publish`, the full url is printed out so that it can be accessed from the terminal easily by doing cmd+click. Implemented only for workers.dev workers.

  Resolves https://github.com/cloudflare/workers-sdk/issues/1530

- [#1552](https://github.com/cloudflare/workers-sdk/pull/1552) [`e9307365`](https://github.com/cloudflare/workers-sdk/commit/e93073659af3bdbb24d8fad8997a134a3a5c19e0) Thanks [@Skye-31](https://github.com/Skye-31)! - fix: invalid regular expression error (pages)

* [#1576](https://github.com/cloudflare/workers-sdk/pull/1576) [`f696ebb5`](https://github.com/cloudflare/workers-sdk/commit/f696ebb5c76353a4a7065757b70a77df4dc2d36b) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add platform/os to usage metrics events

- [#1576](https://github.com/cloudflare/workers-sdk/pull/1576) [`f696ebb5`](https://github.com/cloudflare/workers-sdk/commit/f696ebb5c76353a4a7065757b70a77df4dc2d36b) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: rename pages metrics events to align better with the dashboard

* [#1550](https://github.com/cloudflare/workers-sdk/pull/1550) [`aca9c3e7`](https://github.com/cloudflare/workers-sdk/commit/aca9c3e74dd9f79c54d51499ee3cec983f0b40ee) Thanks [@cameron-robey](https://github.com/cameron-robey)! - feat: describe current permissions in `wrangler whoami`

  Often users experience issues due to tokens not having the correct permissions associated with them (often due to new scopes being created for new products). With this, we print out a list of permissions associated with OAuth tokens with the `wrangler whoami` command to help them debug for OAuth tokens. We cannot access the permissions on an API key, so we direct the user to the location in the dashboard to achieve this.
  We also cache the scopes of OAuth tokens alongside the access and refresh tokens in the .wrangler/config file to achieve this.

  Currently unable to implement https://github.com/cloudflare/workers-sdk/issues/1371 - instead directs the user to the dashboard.
  Resolves https://github.com/cloudflare/workers-sdk/issues/1540

- [#1575](https://github.com/cloudflare/workers-sdk/pull/1575) [`5b1f68ee`](https://github.com/cloudflare/workers-sdk/commit/5b1f68eece2f328c65f749711cfae5105e1e9651) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: legacy "kv-namespace" not supported
  In previous Wrangler 1, there was a legacy configuration that was considered a "bug" and removed.

  Before it was removed, tutorials, templates, blogs, etc... had utlized that configuration property
  to handle this in Wrangler 2 we will throw a blocking error that tell the user to utilize "kv_namespaces"

  resolves #1421

* [#1404](https://github.com/cloudflare/workers-sdk/pull/1404) [`17f5b576`](https://github.com/cloudflare/workers-sdk/commit/17f5b576795a8ca4574a300475c9755829535113) Thanks [@threepointone](https://github.com/threepointone)! - feat: add cache control options to `config.assets`

  This adds cache control options to `config.assets`. This is already supported by the backing library (`@cloudflare/kv-asset-handler`) so we simply pass on the options at its callsite.

  Additionally, this adds a configuration field to serve an app in "single page app" mode, where a root index.html is served for all html/404 requests (also powered by the same library).

- [#1578](https://github.com/cloudflare/workers-sdk/pull/1578) [`cf552192`](https://github.com/cloudflare/workers-sdk/commit/cf552192d58d67a3bacd8ffa2db9d214f960d96a) Thanks [@cameron-robey](https://github.com/cameron-robey)! - feat: source-map function names

  Following on from https://github.com/cloudflare/workers-sdk/pull/1535, using new functionality from esbuild v0.14.50 of generation of `names` field in generated sourcemaps, we output the original function name in the stack trace.

* [#1503](https://github.com/cloudflare/workers-sdk/pull/1503) [`ebc1aa57`](https://github.com/cloudflare/workers-sdk/commit/ebc1aa579a4e884cf2b1889a5245b5ad86716144) Thanks [@threepointone](https://github.com/threepointone)! - feat: zero config multiworker development (local mode)

  Preamble: Typically, a Worker has been the _unit_ of a javascript project on our platform. Any logic that you need, you fit into one worker, ~ 1MB of javascript and bindings. If you wanted to deploy a larger application, you could define different workers on different routes. This is fine for microservice style architectures, but not all projects can be cleaved along the route boundaries; you lose out on sharing code and resources, and can still cross the size limit with heavy dependencies.

  Service bindings provide a novel mechanism for composing multiple workers into a unified architecture. You could deploy shared code into a worker, and make requests to it from another worker. This lets you architect your code along functional boundaries, while also providing some relief to the 1MB size limit.

  I propose a model for developing multiple bound workers in a single project.

  Consider Worker A, at `workers/a.js`, with a `wrangler.toml` like so:

  ```toml
  name = 'A'

  [[services]]
  binding = 'Bee'
  service = 'B'
  ```

  and content like so:

  ```js
  export default {
  	fetch(req, env) {
  		return env.Bee.fetch(req);
  	},
  };
  ```

  Consider Worker B, at `workers/b.js`, with a `wrangler.toml` like so:

  ```toml
  name = 'B'
  ```

  and content like so:

  ```js
  export default {
  	fetch(req, env) {
  		return new Response("Hello World");
  	},
  };
  ```

  So, a worker A, bound to B, that simply passes on the request to B.

  ## Local mode:

  Currently, when I run `wrangler dev --local` on A (or switch from remote to local mode during a dev session), and make requests to A, they'll fail because the bindings don't exist in local mode.

  What I'd like, is to be able to run `wrangler dev --local` on B as well, and have my dev instance of A make requests to the dev instance of B. When I'm happy with my changes, I'd simply deploy both workers (again, ideally as a batched publish).

  ## Proposal: A local dev registry for workers.

  - Running `wrangler dev` on a machine should start up a local service registry (if there isn't one loaded already) as a server on a well known port.
  - Further, it should then "register" itself with the registry with metadata about itself; whether it's running in remote/local mode, the port and ip its dev server is listening on, and any additional configuration (eg: in remote mode, a couple of extra headers have to be added to every request made to the dev session, so we'd add that data into the registry as well.)
  - Every worker that has service bindings configured, should intercept requests to said binding, and instead make a request to the locally running instance of the service. It could rewrite these requests as it pleases.

  (In future PRs, we'll introduce a system for doing the same with remote mode dev, as well as mixed mode. )

  Related to https://github.com/cloudflare/workers-sdk/issues/1182
  Fixes https://github.com/cloudflare/workers-sdk/issues/1040

- [#1551](https://github.com/cloudflare/workers-sdk/pull/1551) [`1b54b54f`](https://github.com/cloudflare/workers-sdk/commit/1b54b54f360262f35f4d04545f98009c982070e2) Thanks [@threepointone](https://github.com/threepointone)! - internal: middleware for modifying worker behaviour

  This adds an internal mechanism for applying multiple "middleware"/facades on to workers. This lets us add functionality during dev and/or publish, where we can modify requests or env, or other ideas. (See https://github.com/cloudflare/workers-sdk/issues/1466 for actual usecases)

  As part of this, I implemented a simple facade that formats errors in dev. To enable it you need to set an environment variable `FORMAT_WRANGLER_ERRORS=true`. This _isn't_ a new feature we're shipping with wrangler, it's simply to demonstrate how to write middleware. We'll probably remove it in the future.

* [#1486](https://github.com/cloudflare/workers-sdk/pull/1486) [`c4e6f156`](https://github.com/cloudflare/workers-sdk/commit/c4e6f1565ac6ef38929c72d37ec27d158ec4f4ee) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: commands added for uploading and downloading objects from r2.

- [#1539](https://github.com/cloudflare/workers-sdk/pull/1539) [`95d0f863`](https://github.com/cloudflare/workers-sdk/commit/95d0f8635e62e76d29718fac16bfa776b4b4ae02) Thanks [@threepointone](https://github.com/threepointone)! - fix: export durable objects correctly when using `--assets`

  The facade for static assets doesn't export any exports from the entry point, meaning Durable Objects will fail. This fix adds all exports to the facade's exports.

* [#1564](https://github.com/cloudflare/workers-sdk/pull/1564) [`69713c5c`](https://github.com/cloudflare/workers-sdk/commit/69713c5c4dba34016be0c634548e25eb45368829) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - chore: updated wrangler readme providing additional context on configuration, deep link to `init` and fixing old link to beta docs.

- [#1581](https://github.com/cloudflare/workers-sdk/pull/1581) [`3da184f1`](https://github.com/cloudflare/workers-sdk/commit/3da184f1386f60658af5d29c68eda4ac0b28234e) Thanks [@threepointone](https://github.com/threepointone)! - fix: apply multiworker dev facade only when required

  This fix makes sure the multiworker dev facade is applied to the input worker only where there are other wrangler dev instances running that are bound to the input worker. We also make sure we don't apply it when we already have a binding (like in remote mode).

* [#1476](https://github.com/cloudflare/workers-sdk/pull/1476) [`cf9f932a`](https://github.com/cloudflare/workers-sdk/commit/cf9f932acc5f22dfceac462cff9d9c90a71622f0) Thanks [@alankemp](https://github.com/alankemp)! - Add logfwdr binding

- [#1576](https://github.com/cloudflare/workers-sdk/pull/1576) [`f696ebb5`](https://github.com/cloudflare/workers-sdk/commit/f696ebb5c76353a4a7065757b70a77df4dc2d36b) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add metricsEnabled header to CF API calls when developing or deploying a worker

  This allows us to estimate from API requests what proportion of Wrangler
  instances have enabled usage tracking, without breaking the agreement not
  to send data for those who have not opted in.

* [#1525](https://github.com/cloudflare/workers-sdk/pull/1525) [`a692ace3`](https://github.com/cloudflare/workers-sdk/commit/a692ace3545e3b8bec5410a689dec6aa6c388d5a) Thanks [@threepointone](https://github.com/threepointone)! - feat: `config.first_party_worker` + dev facade

  This introduces configuration for marking a worker as a "first party" worker, to be used inside cloudflare to develop workers. It also adds a facade that's applied for first party workers in dev.

- [#1545](https://github.com/cloudflare/workers-sdk/pull/1545) [`b3424e43`](https://github.com/cloudflare/workers-sdk/commit/b3424e43e53192f4d4268d9a0c1c6aab1f4ffe84) Thanks [@Martin-Eriksson](https://github.com/Martin-Eriksson)! - fix: Throw error if both `directory` and `command` is specified for `pages dev`

  The previous behavior was to silently ignore the `command` argument.

* [#1574](https://github.com/cloudflare/workers-sdk/pull/1574) [`c61006ca`](https://github.com/cloudflare/workers-sdk/commit/c61006caf8a53bd24d686a168288f6aa28e0f625) Thanks [@jahands](https://github.com/jahands)! - fix: Retry check-missing call to make wrangler pages publish more reliable

  Before uploading files in wrangler pages publish, we make a network call to check what files need to be uploaded. This call could sometimes fail, causing the publish to fail. This change will retry that network call.

- [#1565](https://github.com/cloudflare/workers-sdk/pull/1565) [`2b5a2e9a`](https://github.com/cloudflare/workers-sdk/commit/2b5a2e9ad2cc11e0cc20fea3e30089d70b93902c) Thanks [@threepointone](https://github.com/threepointone)! - fix: export durable object bindings when using service bindings in dev

  A similar fix to https://github.com/cloudflare/workers-sdk/pull/1539, this exports correctly when using service bindings in dev.

* [#1510](https://github.com/cloudflare/workers-sdk/pull/1510) [`4dadc414`](https://github.com/cloudflare/workers-sdk/commit/4dadc414e131a7eb0e5c2ab2f0046a669491e7dc) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - refactor: touch up publishing to custom domains

  Couple things cleaned up here:

  Originally the usage of the /domains api (for publishing to custom domains) was a bit clumsy: we would attempt to optimistically publish, but the api would eagerly fail with specific error codes on why it occurred. This made for some weird control flow for retries with override flags, as well as fragile extraction of error messages.

  Now we use the new /domains/changeset api to generate a changeset of actions required to get to a new state of custom domains, which informs us up front of which domains would need to be updated and overridden, and we can pass flags as needed. I do make an extra hop back to the api to lookup what the custom domains requiring updates are already attached to, but given how helpful I imagine that to be, I'm for it.

  I also updated the api used for publishing the domains, from /domains to /domains/records. The latter was added to allow us to add flexibility for things like the /domains/changeset resource, and thus the former is being deprecated

- [#1576](https://github.com/cloudflare/workers-sdk/pull/1576) [`f696ebb5`](https://github.com/cloudflare/workers-sdk/commit/f696ebb5c76353a4a7065757b70a77df4dc2d36b) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: send whether a Worker is using TypeScript or not in usage events

* [#1535](https://github.com/cloudflare/workers-sdk/pull/1535) [`eee7333b`](https://github.com/cloudflare/workers-sdk/commit/eee7333b47d009880b8def8cf4772b6d5fcf79e9) Thanks [@cameron-robey](https://github.com/cameron-robey)! - feat: source maps support in `wrangler dev` remote mode

  Previously stack traces from runtime errors in `wrangler dev` remote mode, would give unhelpful stack traces from the bundled build that was sent to the server. Here, we use source maps generated as part of bundling to provide better stack traces for errors, referencing the unbundled files.

  Resolves https://github.com/cloudflare/workers-sdk/issues/1509

## 2.0.23

### Patch Changes

- [#1500](https://github.com/cloudflare/workers-sdk/pull/1500) [`0826f833`](https://github.com/cloudflare/workers-sdk/commit/0826f8333f4079191594fb81cae28e2a4cc5b6f2) Thanks [@cameron-robey](https://github.com/cameron-robey)! - fix: warn when using `--no-bundle` with `--minify` or `--node-compat`

  Fixes https://github.com/cloudflare/workers-sdk/issues/1491

* [#1523](https://github.com/cloudflare/workers-sdk/pull/1523) [`e1e2ee5c`](https://github.com/cloudflare/workers-sdk/commit/e1e2ee5c6fbeb37eb098bce4e6b0c28dd146c022) Thanks [@threepointone](https://github.com/threepointone)! - fix: don't log version spam in tests

  Currently in tests, we see a bunch of logspam from yargs about "version" being a reserved word, this patch removes that spam.

- [#1498](https://github.com/cloudflare/workers-sdk/pull/1498) [`fe3fbd95`](https://github.com/cloudflare/workers-sdk/commit/fe3fbd952d191fde9ebda53b9b4b3fcf2ab9bee0) Thanks [@cameron-robey](https://github.com/cameron-robey)! - feat: change version command to give update information
  When running version command, we want to display update information if current version is not up to date. Achieved by replacing default output with the wrangler banner.
  Previous behaviour (just outputting current version) reamins when !isTTY.
  Version command changed from inbuilt .version() from yargs, to a regular command to allow for asynchronous behaviour.

  Implements https://github.com/cloudflare/workers-sdk/issues/1492

* [#1431](https://github.com/cloudflare/workers-sdk/pull/1431) [`a2e3a6b7`](https://github.com/cloudflare/workers-sdk/commit/a2e3a6b7f7451f9df9718f75e4c03a9e379d6a42) Thanks [@Skye-31](https://github.com/Skye-31)! - chore: Refactor `wrangler pages dev` to use Wrangler-proper's own dev server.

  This:

  - fixes some bugs (e.g. not proxying WebSockets correctly),
  - presents a much nicer UI (with the slick keybinding controls),
  - adds features that `pages dev` was missing (e.g. `--local-protocol`),
  - and reduces the maintenance burden of `wrangler pages dev` going forward.

- [#1528](https://github.com/cloudflare/workers-sdk/pull/1528) [`60bdc31a`](https://github.com/cloudflare/workers-sdk/commit/60bdc31a6fbeb66a5112202c400301439a999f76) Thanks [@threepointone](https://github.com/threepointone)! - fix: prevent local mode restart

  In dev, we inject a patch for `fetch()` to detect bad usages. This patch is copied into the destination directory before it's used. esbuild appears to have a bug where it thinks a dependency has changed so it restarts once in local mode. The fix here is to copy the file to inject into a separate temporary dir.

  Fixes https://github.com/cloudflare/workers-sdk/issues/1515

* [#1502](https://github.com/cloudflare/workers-sdk/pull/1502) [`be4ffde5`](https://github.com/cloudflare/workers-sdk/commit/be4ffde5f92e9631e38e8696b4d573906094c05a) Thanks [@threepointone](https://github.com/threepointone)! - polish: recommend using an account id when user details aren't available.

  When using an api token, sometimes the call to get a user's membership details fails with a 9109 error. In this scenario, a workaround to skip the membership check is to provide an account_id in wrangler.toml or via CLOUDFLARE_ACCOUNT_ID. This bit of polish adds this helpful tip into the error message.

- [#1499](https://github.com/cloudflare/workers-sdk/pull/1499) [`7098b1ee`](https://github.com/cloudflare/workers-sdk/commit/7098b1ee9b26a1a8e70bab2988559f9313d7b89c) Thanks [@cameron-robey](https://github.com/cameron-robey)! - fix: no feedback on `wrangler kv:namespace delete`

* [#1479](https://github.com/cloudflare/workers-sdk/pull/1479) [`862f14e5`](https://github.com/cloudflare/workers-sdk/commit/862f14e570546b601795f617d2cdb9d8d4c65740) Thanks [@threepointone](https://github.com/threepointone)! - fix: read `process.env.NODE_ENV` correctly when building worker

  We replace `process.env.NODE_ENV` in workers with the value of the environment variable. However, we have a bug where when we make an actual build of wrangler (which has NODE_ENV set as "production"), we were also replacing the expression where we'd replace it in a worker. The result was that all workers would have `process.env.NODE_ENV` set to production, no matter what the user had set. The fix here is to use a "dynamic" value for the expression so that our build system doesn't replace it.

  Fixes https://github.com/cloudflare/workers-sdk/issues/1477

- [#1471](https://github.com/cloudflare/workers-sdk/pull/1471) [`0953af8e`](https://github.com/cloudflare/workers-sdk/commit/0953af8e42f0eca599306bd02a263dc30196781d) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - ci: implement CodeCov Integration
  CodeCov is used for analyzing code and tests to improve stability and maintainability. It does this by utilizing static code analysis
  and testing output to provide insights into things that need improving, security concerns, missing test coverage of critical code, and more,
  which can be missed even after exhaustive human review.

* [#1516](https://github.com/cloudflare/workers-sdk/pull/1516) [`e178d6fb`](https://github.com/cloudflare/workers-sdk/commit/e178d6fbceab858fbc9a8462d455b6661368f472) Thanks [@threepointone](https://github.com/threepointone)! - polish: don't log an error message if wrangler dev startup is interrupted.

  When we quit wrangler dev, any inflight requests are cancelled. Any error handlers for those requests are ignored if the request was cancelled purposely. The check for this was missing for the prewarm request for a dev session, and this patch adds it so it dorsn't get logged to the terminal.

- [#1496](https://github.com/cloudflare/workers-sdk/pull/1496) [`8eb91142`](https://github.com/cloudflare/workers-sdk/commit/8eb911426194dbdd8a579a19baa8e806f7b8e571) Thanks [@threepointone](https://github.com/threepointone)! - fix: add `fetch()` dev helper correctly for pnp style package managers

  In https://github.com/cloudflare/workers-sdk/pull/992, we added a dev-only helper that would warn when using `fetch()` in a manner that wouldn't work as expected (because of a bug we currently have in the runtime). We did this by injecting a file that would override usages of `fetch()`. When using pnp style package managers like yarn, this file can't be resolved correctly. So to fix that, we extract it into the temporary destination directory that we use to build the worker (much like a similar fix we did in https://github.com/cloudflare/workers-sdk/pull/1154)

  Reported at https://github.com/cloudflare/workers-sdk/issues/1320#issuecomment-1188804668

* [#1529](https://github.com/cloudflare/workers-sdk/pull/1529) [`1a0ac8d0`](https://github.com/cloudflare/workers-sdk/commit/1a0ac8d01c1b351eb7bb8e051ca12472e177f516) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Adds the `--experimental-enable-local-persistence` option to `wrangler pages dev`

  Previously, this was implicitly enabled and stored things in a `.mf` directory. Now we move to be in line with what `wrangler dev` does, defaults disabled, and stores in a `wrangler-local-state` directory.

- [#1514](https://github.com/cloudflare/workers-sdk/pull/1514) [`9271680d`](https://github.com/cloudflare/workers-sdk/commit/9271680dc98e6f0363f6d3576c99b5382e35cf86) Thanks [@threepointone](https://github.com/threepointone)! - feat: add `config.inspector_port`

  This adds a configuration option for the inspector port used by the debugger in `wrangler dev`. This also includes a bug fix where we weren't passing on this configuration to local mode.

## 2.0.22

### Patch Changes

- [#1482](https://github.com/cloudflare/workers-sdk/pull/1482) [`9eb28ec`](https://github.com/cloudflare/workers-sdk/commit/9eb28eccccbf690b1e7a73d5671419d259abc5f8) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: do not ask the user for metrics permission if running in a CI

  Fixes https://github.com/cloudflare/workers-sdk/issues/1480

* [#1482](https://github.com/cloudflare/workers-sdk/pull/1482) [`9eb28ec`](https://github.com/cloudflare/workers-sdk/commit/9eb28eccccbf690b1e7a73d5671419d259abc5f8) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: support controlling metrics gathering via `WRANGLER_SEND_METRICS` environment variable

  Setting the `WRANGLER_SEND_METRICS` environment variable will override any other metrics controls,
  such as the `send_metrics` property in wrangler.toml and cached user preference.

## 2.0.21

### Patch Changes

- [#1474](https://github.com/cloudflare/workers-sdk/pull/1474) [`f602df7`](https://github.com/cloudflare/workers-sdk/commit/f602df74b07d1a57a6e575bd1a546c969c8057fa) Thanks [@threepointone](https://github.com/threepointone)! - fix: enable debugger in local mode

  During a refactor, we missed enabling the inspector by default in local mode. We also broke the logic that detects the inspector url exposed by the local server. This patch passes the argument correctly, fixes the detection logic. Further, it also lets you disable the inspector altogether with `--inspect false`, if required (for both remote and local mode).

  Fixes https://github.com/cloudflare/workers-sdk/issues/1436

* [#1470](https://github.com/cloudflare/workers-sdk/pull/1470) [`01f49f1`](https://github.com/cloudflare/workers-sdk/commit/01f49f15797398797b96789606504a10f257d8e1) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure that metrics user interactions do not break other UI

  The new metrics usage capture may interact with the user if they have not yet set their metrics permission.
  Sending metrics was being done concurrently with other commands, so there was a chance that the metrics UI broke the other command's UI.
  Now we ensure that metrics UI will happen synchronously.

## 2.0.20

### Patch Changes

- [#1464](https://github.com/cloudflare/workers-sdk/pull/1464) [`0059d84`](https://github.com/cloudflare/workers-sdk/commit/0059d842d7efc3c0938a21284ee3a67950c9d252) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - ci: ensure that the SPARROW_SOURCE_KEY is included in release builds

  Previously, we were including the key in the "build" step of the release job.
  But this is only there to check that the build doesn't fail.
  The build is re-run inside the publish step, which is part of the "changeset" step.
  Now, we include the key in the "changeset" step to ensure it is there in the build that is published.

## 2.0.19

### Patch Changes

- [#1410](https://github.com/cloudflare/workers-sdk/pull/1410) [`52fb634`](https://github.com/cloudflare/workers-sdk/commit/52fb6342c16f862da4d4e3df42227a72c8cbe0ce) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add opt-in usage metrics gathering

  This change adds support in Wrangler for sending usage metrics to Cloudflare.
  This is an opt-in only feature. We will ask the user for permission only once per device.
  The user must grant permission, on a per device basis, before we send usage metrics to Cloudflare.
  The permission can also be overridden on a per project basis by setting `send_metrics = false` in the `wrangler.toml`.
  If Wrangler is running in non-interactive mode (such as in a CI job) and the user has not already given permission
  we will assume that we cannot send usage metrics.

  The aim of this feature is to help us learn what and how features of Wrangler (and also the Cloudflare dashboard)
  are being used in order to improve the developer experience.

* [#1457](https://github.com/cloudflare/workers-sdk/pull/1457) [`de03f7f`](https://github.com/cloudflare/workers-sdk/commit/de03f7fc044b3a7d90b3c762722ef90eceab6d09) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: add r2Persist key to miniflare options

  Closes #1454

- [#1463](https://github.com/cloudflare/workers-sdk/pull/1463) [`a7ae733`](https://github.com/cloudflare/workers-sdk/commit/a7ae733d242b906928bcdd2c15a392a383ab887b) Thanks [@threepointone](https://github.com/threepointone)! - fix: ensure that a helpful error message is shown when on unsupported versions of node.js

  Our entrypoint for wrangler (`bin/wrangler.js`) needs to run in older versions of node and log a message to the user that they need to upgrade their version of node. Sometimes we use syntax in this entrypoint that doesn't run in older versions of node. crashing the script and failing to log the message. This fix adds a test in CI to make sure we don't regress on that behaviour (as well as fixing the current newer syntax usage)

  Fixes https://github.com/cloudflare/workers-sdk/issues/1443

* [#1459](https://github.com/cloudflare/workers-sdk/pull/1459) [`4e425c6`](https://github.com/cloudflare/workers-sdk/commit/4e425c62da2a59e6aa3a78d654c252e177c2b6ad) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - fix: `wrangler pages publish` now more reliably retries an upload in case of a failure

  When `wrangler pages publish` is run, we make calls to an upload endpoint which could be rate limited and therefore fail. We currently retry those calls after a linear backoff. This change makes that backoff exponential which should reduce the likelihood of subsequent calls being rate limited.

## 2.0.18

### Patch Changes

- [#1451](https://github.com/cloudflare/workers-sdk/pull/1451) [`62649097`](https://github.com/cloudflare/workers-sdk/commit/62649097ca1d4bc8e3753cc68e6b230c213d59bd) Thanks [@WalshyDev](https://github.com/WalshyDev)! - Fixed an issue where Pages upload would OOM. This was caused by us loading all the file content into memory instead of only when required.

* [#1375](https://github.com/cloudflare/workers-sdk/pull/1375) [`e9e98721`](https://github.com/cloudflare/workers-sdk/commit/e9e987212e0eb7fe8669f13800ca98b39a348ca6) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - polish: Compliance with the XDG Base Directory Specification
  Wrangler was creating a config file in the home directory of the operating system `~/.wrangler`. The XDG path spec is a
  standard for storing files, these changes include XDG pathing compliance for `.wrangler/*` location and backwards compatibility with previous
  `~/.wrangler` locations.

  resolves #1053

- [#1449](https://github.com/cloudflare/workers-sdk/pull/1449) [`ee6c421b`](https://github.com/cloudflare/workers-sdk/commit/ee6c421bbcf166ca7699d3cb21f6c18cf2062c55) Thanks [@alankemp](https://github.com/alankemp)! - Output additional information about uploaded scripts at WRANGLER_LOG=log level

## 2.0.17

### Patch Changes

- [#1389](https://github.com/cloudflare/workers-sdk/pull/1389) [`eab9542`](https://github.com/cloudflare/workers-sdk/commit/eab95429e3bdf274c82db050856c8c675d7fb10d) Thanks [@caass](https://github.com/caass)! - Remove delegation message when global wrangler delegates to a local installation

  A message used for debugging purposes was accidentally left in, and confused some
  folks. Now it'll only appear when `WRANGLER_LOG` is set to `debug`.

* [#1447](https://github.com/cloudflare/workers-sdk/pull/1447) [`16f9436`](https://github.com/cloudflare/workers-sdk/commit/16f943621f1c6bd1301b2a4e87d54acf2fc777fe) Thanks [@threepointone](https://github.com/threepointone)! - feat: r2 support in `wrangler dev --local`

  This adds support for r2 bindings in `wrangler dev --local`, powered by miniflare@2.6.0 via https://github.com/cloudflare/miniflare/pull/289.

  Fixes https://github.com/cloudflare/workers-sdk/issues/1066

- [#1406](https://github.com/cloudflare/workers-sdk/pull/1406) [`0f35556`](https://github.com/cloudflare/workers-sdk/commit/0f35556271ed27efd6fcc581646c2d2d8f520276) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: use fork to let wrangler know miniflare is ready

  This PR replaces our use of `spawn` in favour of `fork` to spawn miniflare in wrangler's dev function. This lets miniflare let wrangler know when we're ready to send requests.

  Closes #1408

* [#1442](https://github.com/cloudflare/workers-sdk/pull/1442) [`f9efc04`](https://github.com/cloudflare/workers-sdk/commit/f9efc0483b20de41a83ddd20b7a6b166dddf6cf0) Thanks [@jrencz](https://github.com/jrencz)! - fix: add missing `metadata` option to `kv:key put`

  Closes #1441

- [#999](https://github.com/cloudflare/workers-sdk/pull/999) [`238b546`](https://github.com/cloudflare/workers-sdk/commit/238b546cc84bc7583f6668be25b7746c48d1a3fb) Thanks [@caass](https://github.com/caass)! - Include devtools in wrangler monorepo

  Previously, wrangler relied on @threepointone's [built-devtools](https://github.com/threepointone/built-devtools). Now, these devtools are included in the wrangler repository.

* [#1424](https://github.com/cloudflare/workers-sdk/pull/1424) [`8cf0008`](https://github.com/cloudflare/workers-sdk/commit/8cf00084fda9bbbc7482e4186b91dbb7a258db52) Thanks [@caass](https://github.com/caass)! - fix: Check `config.assets` when deciding whether to include a default entry point.

  An entry point isn't mandatory when using `--assets`, and we can use a default worker when doing so. This fix enables that same behaviour when `config.assets` is configured.

- [#1448](https://github.com/cloudflare/workers-sdk/pull/1448) [`0d462c0`](https://github.com/cloudflare/workers-sdk/commit/0d462c00f0d622b92dd1d2e6156dd40208bc8abc) Thanks [@threepointone](https://github.com/threepointone)! - polish: set `checkjs: false` and `jsx: "react"` in newly created projects

  When we create a new project, it's annoying having to set jsx: "react" when that's the overwhelmingly default choice, our compiler is setup to do it automatically, and the tsc error message isn't helpful. So we set `jsx: "react"` in the generated tsconfig.

  Setting `checkJs: true` is also annoying because it's _not_ a common choice. So we set `checkJs: false` in the generated tsconfig.

* [#1450](https://github.com/cloudflare/workers-sdk/pull/1450) [`172310d`](https://github.com/cloudflare/workers-sdk/commit/172310d01f5a244c3215b090fe42c6b38172cdeb) Thanks [@threepointone](https://github.com/threepointone)! - polish: tweak static assets facade to log only real errors

  This prevents the abundance of NotFoundErrors being unnecessaryily logged.

- [#1415](https://github.com/cloudflare/workers-sdk/pull/1415) [`f3a8452`](https://github.com/cloudflare/workers-sdk/commit/f3a84520960c163df7ada0c1dd1f784db9ca8497) Thanks [@caass](https://github.com/caass)! - Emit type declarations for wrangler

  This is a first go-round of emitting type declarations alongside the bundled JS output,
  which should make it easier to use wrangler as a library.

* [#1433](https://github.com/cloudflare/workers-sdk/pull/1433) [`1c1214f`](https://github.com/cloudflare/workers-sdk/commit/1c1214fc574eb9a46faadfb9ae21e3cc5dbc5836) Thanks [@threepointone](https://github.com/threepointone)! - polish: adds an actionable message when a worker name isn't provided to tail/secret

  Just a better error message when a Worker name isn't available for `wrangler secret` or `wrangler tail`.

  Closes https://github.com/cloudflare/workers-sdk/issues/1380

- [#1427](https://github.com/cloudflare/workers-sdk/pull/1427) [`3fa5041`](https://github.com/cloudflare/workers-sdk/commit/3fa50413ebf70ba69d0ecfadddcbfabb88d273fe) Thanks [@caass](https://github.com/caass)! - Check `npm_config_user_agent` to guess a user's package manager

  The environment variable `npm_config_user_agent` can be used to guess the package manager
  that was used to execute wrangler. It's imperfect (just like regular user agent sniffing!)
  but the package managers we support all set this property:

  - [npm](https://github.com/npm/cli/blob/1415b4bdeeaabb6e0ba12b6b1b0cc56502bd64ab/lib/utils/config/definitions.js#L1945-L1979)
  - [pnpm](https://github.com/pnpm/pnpm/blob/cd4f9341e966eb8b411462b48ff0c0612e0a51a7/packages/plugin-commands-script-runners/src/makeEnv.ts#L14)
  - [yarn](https://yarnpkg.com/advanced/lifecycle-scripts#environment-variables)
  - [yarn classic](https://github.com/yarnpkg/yarn/pull/4330)

## 2.0.16

### Patch Changes

- [#992](https://github.com/cloudflare/workers-sdk/pull/992) [`ee6b413`](https://github.com/cloudflare/workers-sdk/commit/ee6b4138121b200c86566b61fdb01495cb05947b) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add warning to `fetch()` calls that will change the requested port

  In Workers published to the Edge (rather than previews) there is a bug where a custom port on a downstream fetch request is ignored, defaulting to the standard port.
  For example, `https://my.example.com:668` will actually send the request to `https://my.example.com:443`.

  This does not happen when using `wrangler dev` (both in remote and local mode), but to ensure that developers are aware of it this change displays a runtime warning in the console when the bug is hit.

  Closes #1320

* [#1378](https://github.com/cloudflare/workers-sdk/pull/1378) [`2579257`](https://github.com/cloudflare/workers-sdk/commit/25792574c4197257203ba0a11e7129b2b94cec17) Thanks [@rozenmd](https://github.com/rozenmd)! - chore: fully deprecate the `preview` command

  Before, we would warn folks that `preview` was deprecated in favour of `dev`, but then ran `dev` on their behalf.
  To avoid maintaining effectively two versions of the `dev` command, we're now just telling folks to run `dev`.

- [#1213](https://github.com/cloudflare/workers-sdk/pull/1213) [`1bab3f6`](https://github.com/cloudflare/workers-sdk/commit/1bab3f6923c1d205c3a3bc9ee490adf20245cb21) Thanks [@threepointone](https://github.com/threepointone)! - fix: pass `routes` to `dev` session

  We can pass routes when creating a `dev` session. The effect of this is when you visit a path that _doesn't_ match the given routes, then it instead does a fetch from the deployed worker on that path (if any). We were previously passing `*/*`, i.e, matching _all_ routes in dev; this fix now passes configured routes instead.

* [#1374](https://github.com/cloudflare/workers-sdk/pull/1374) [`215c4f0`](https://github.com/cloudflare/workers-sdk/commit/215c4f01923b20d26d04f682b0721f9de2a812f1) Thanks [@threepointone](https://github.com/threepointone)! - feat: commands to manage worker namespaces

  This adds commands to create, delete, list, and get info for "worker namespaces" (name to be bikeshed-ed). This is based on work by @aaronlisman in https://github.com/cloudflare/workers-sdk/pull/1310.

- [#1403](https://github.com/cloudflare/workers-sdk/pull/1403) [`9c6c3fb`](https://github.com/cloudflare/workers-sdk/commit/9c6c3fb5dedeeb96112830381dcf7ff5b49bbb6e) Thanks [@threepointone](https://github.com/threepointone)! - feat: `config.no_bundle` as a configuration option to prevent bundling

  As a configuration parallel to `--no-bundle` (introduced in https://github.com/cloudflare/workers-sdk/pull/1300 as `--no-build`, renamed in https://github.com/cloudflare/workers-sdk/pull/1399 to `--no-bundle`), this introduces a configuration field `no_bundle` to prevent bundling of the worker before it's published. It's inheritable, which means it can be defined inside environments as well.

* [#1355](https://github.com/cloudflare/workers-sdk/pull/1355) [`61c31a9`](https://github.com/cloudflare/workers-sdk/commit/61c31a980a25123e96f5f69277d74997118eb323) Thanks [@williamhorning](https://github.com/williamhorning)! - fix: Fallback to non-interactive mode on error

  If the terminal isn't a TTY, fallback to non-interactive mode instead of throwing an error. This makes it so users of Bash on Windows can pipe to wrangler without an error being thrown.

  resolves #1303

- [#1337](https://github.com/cloudflare/workers-sdk/pull/1337) [`1d778ae`](https://github.com/cloudflare/workers-sdk/commit/1d778ae16c432166b39dd6435a4bab49a2248e06) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - polish: bundle reporter was not printing during publish errors

  The reporter is now called before the publish API call, printing every time.

  resolves #1328

* [#1393](https://github.com/cloudflare/workers-sdk/pull/1393) [`b36ef43`](https://github.com/cloudflare/workers-sdk/commit/b36ef43e72ebda495a68011f167acac437f7f8d7) Thanks [@threepointone](https://github.com/threepointone)! - chore: enable node's experimental fetch flag

  We'd previously had some funny behaviour with undici clashing with node's own fetch supporting classes, and had turned off node's fetch implementation. Recent updates to undici appear to have fixed the issue, so let's turn it back on.

  Closes https://github.com/cloudflare/workers-sdk/issues/834

- [#1335](https://github.com/cloudflare/workers-sdk/pull/1335) [`49cf17e`](https://github.com/cloudflare/workers-sdk/commit/49cf17e6e605f2b446fea01d158d7ddee49a22b9) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: resolve `--assets` cli arg relative to current working directory

  Before we were resolving the Asset directory relative to the location of `wrangler.toml` at all times.
  Now the `--assets` cli arg is resolved relative to current working directory.

  resolves #1333

* [#1350](https://github.com/cloudflare/workers-sdk/pull/1350) [`dee034b`](https://github.com/cloudflare/workers-sdk/commit/dee034b5b8628fec9afe3d1bf6aa392f269f6cd4) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: export an (unstable) function that folks can use in their own scripts to invoke wrangler's dev CLI

  Closes #1350

- [#1342](https://github.com/cloudflare/workers-sdk/pull/1342) [`6426625`](https://github.com/cloudflare/workers-sdk/commit/6426625805a9e9ce37029454e37bb3dd7d05837c) Thanks [@rozenmd](https://github.com/rozenmd)! - polish: split dev function out of index.tsx

* [#1401](https://github.com/cloudflare/workers-sdk/pull/1401) [`6732d95`](https://github.com/cloudflare/workers-sdk/commit/6732d9501f9f430e431ba03b1c630d8d7f2c2818) Thanks [@threepointone](https://github.com/threepointone)! - fix: log pubsub beta usage warnings consistently

  This fix makes sure the pubsub beta warnings are logged consistently, once per help menu, through the hierarchy of its command tree.

  Fixes https://github.com/cloudflare/workers-sdk/issues/1370

- [#1344](https://github.com/cloudflare/workers-sdk/pull/1344) [`7ba19fe`](https://github.com/cloudflare/workers-sdk/commit/7ba19fe925f6de5acddf94bb065b19245cc5b887) Thanks [@rozenmd](https://github.com/rozenmd)! - polish: move init into its own file

* [#1386](https://github.com/cloudflare/workers-sdk/pull/1386) [`4112001`](https://github.com/cloudflare/workers-sdk/commit/411200148e4db4c229b329c5f915324a3a54ac86) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: implement fetch for wrangler's unstable_dev API, and write our first integration test.

  Prior to this PR, users of `unstable_dev` had to provide their own fetcher, and guess the address and port that the wrangler dev server was using.

  With this implementation, it's now possible to test wrangler, using just wrangler (and a test framework):

  ```js
  describe("worker", async () => {
    const worker = await wrangler.unstable_dev("src/index.ts");

    const resp = await worker.fetch();

    expect(resp).not.toBe(undefined);
    if (resp) {
      const text = await resp.text();
      expect(text).toMatchInlineSnapshot(`"Hello World!"`);
    }

    worker.stop();
  }
  ```

  Closes #1383
  Closes #1384
  Closes #1385

- [#1399](https://github.com/cloudflare/workers-sdk/pull/1399) [`1ab71a7`](https://github.com/cloudflare/workers-sdk/commit/1ab71a7ed3cb19000f5be1c1ff3f2ac062eccaca) Thanks [@threepointone](https://github.com/threepointone)! - fix: rename `--no-build` to `--no-bundle`

  This fix renames the `--no-build` cli arg to `--no-bundle`. `no-build` wasn't a great name because it would imply that we don't run custom builds specified under `[build]` which isn't true. So we rename closer to what wrangler actually does, which is bundling the input. This also makes it clearer that it's a single file upload.

* [#1278](https://github.com/cloudflare/workers-sdk/pull/1278) [`8201733`](https://github.com/cloudflare/workers-sdk/commit/820173330031acda5d2cd5c1b7bca58209a6ddff) Thanks [@Maximo-Guk](https://github.com/Maximo-Guk)! - Throw error if user attempts to use config with pages

- [#1398](https://github.com/cloudflare/workers-sdk/pull/1398) [`ecfbb0c`](https://github.com/cloudflare/workers-sdk/commit/ecfbb0cb85ebf6c7e12866ed1f047634c9cf6423) Thanks [@threepointone](https://github.com/threepointone)! - Added support for pubsub namespace (via @elithrar in https://github.com/cloudflare/workers-sdk/pull/1314)

  This adds support for managing pubsub namespaces and brokers (https://developers.cloudflare.com/pub-sub/)

* [#1348](https://github.com/cloudflare/workers-sdk/pull/1348) [`eb948b0`](https://github.com/cloudflare/workers-sdk/commit/eb948b09930b3a0a39cd66638cc36e61c73fef55) Thanks [@threepointone](https://github.com/threepointone)! - polish: add an experimental warning if `--assets` is used

  We already have a warning when `config.assets` is used, this adds it for the cli argument as well.

- [#1326](https://github.com/cloudflare/workers-sdk/pull/1326) [`12f2703`](https://github.com/cloudflare/workers-sdk/commit/12f2703c5130524f95df823dc30358ad51584759) Thanks [@timabb031](https://github.com/timabb031)! - fix: show console.error/console.warn logs when using `dev --local`.

  Prior to this change, logging with console.error/console.warn in a Worker wouldn't output anything to the console when running in local mode. This was happening because stderr data event handler was being removed after the `Debugger listening...` string was found.

  This change updates the stderr data event handler to forward on all events to `process.stderr`.

  Closes #1324

* [#1309](https://github.com/cloudflare/workers-sdk/pull/1309) [`e5a6aca`](https://github.com/cloudflare/workers-sdk/commit/e5a6aca696108cda8c3890b8ce2ec44c6cc09a0e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - style: convert all source code indentation to tabs

  Fixes #1298

- [#1395](https://github.com/cloudflare/workers-sdk/pull/1395) [`88f2702`](https://github.com/cloudflare/workers-sdk/commit/88f270223be22c74b6374f6eefdf8e9fbf798e4d) Thanks [@threepointone](https://github.com/threepointone)! - feat: cache account id selection

  This adds caching for account id fetch/selection for all wrangler commands.

  Currently, if we have an api/oauth token, but haven't provided an account id, we fetch account information from cloudflare. If a user has just one account id, we automatically choose that. If there are more than one, then we show a dropdown and ask the user to pick one. This is convenient, and lets the user not have to specify their account id when starting a project.

  However, if does make startup slow, since it has to do that fetch every time. It's also annoying for folks with multiple account ids because they have to pick their account id every time.

  So we now cache the account details into `node_modules/.cache/wrangler` (much like pages already does with account id and project name).

  This patch also refactors `config-cache.ts`; it only caches if there's a `node_modules` folder, and it looks for the closest node_modules folder (and not directly in cwd). I also added tests for when a `node_modules` folder isn't available. It also trims the message that we log to terminal.

  Closes https://github.com/cloudflare/workers-sdk/issues/300

* [#1391](https://github.com/cloudflare/workers-sdk/pull/1391) [`ea7ee45`](https://github.com/cloudflare/workers-sdk/commit/ea7ee452470a6a3f16768ab5de226c87d1ff2c0c) Thanks [@threepointone](https://github.com/threepointone)! - fix: create a single session during remote dev

  Previously, we would be creating a fresh session for every script change during remote dev. While this _worked_, it makes iterating slower, and unnecessarily discards state. This fix makes it so we create only a single session for remote dev, and reuses that session on every script change. This also means we can use a single script id for every worker in a session (when a name isn't already given). Further, we also make the prewarming call of the preview space be non-blocking.

  Fixes https://github.com/cloudflare/workers-sdk/issues/1191

- [#1365](https://github.com/cloudflare/workers-sdk/pull/1365) [`b9f7200`](https://github.com/cloudflare/workers-sdk/commit/b9f7200afdfd2dbfed277fbb3c29ddbdaaa969da) Thanks [@threepointone](https://github.com/threepointone)! - fix: normalise `account_id = ''` to `account_id: undefined`

  In older templates, (i.e made for Wrangler v1.x), `account_id =''` is considered as a valid input, but then ignored. With Wrangler 2, when running wrangler dev, we log an error, but it fixes itself after we get an account id. Much like https://github.com/cloudflare/wrangler2/issues/1329, the fix here is to normalise that value when we see it, and replace it with `undefined` while logging a warning.

  This fix also tweaks the messaging for a blank route value to suggest some user action.

* [#1360](https://github.com/cloudflare/workers-sdk/pull/1360) [`cd66b67`](https://github.com/cloudflare/workers-sdk/commit/cd66b670bbe89bfcbde6b229f0046c9e52c0accc) Thanks [@SirCremefresh](https://github.com/SirCremefresh)! - Updated eslint to version 0.14.47

- [#1363](https://github.com/cloudflare/workers-sdk/pull/1363) [`b2c2c2b`](https://github.com/cloudflare/workers-sdk/commit/b2c2c2b86278734f9ddf398dbb93c06ffcc0d5b0) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: display email from process env in whoami and display better error when lacking permissions

* [#1343](https://github.com/cloudflare/workers-sdk/pull/1343) [`59a83f8`](https://github.com/cloudflare/workers-sdk/commit/59a83f8ff4fc1bffcf049ad4795d3539d25f9eb8) Thanks [@rozenmd](https://github.com/rozenmd)! - polish: split generate into its own file

- [#1300](https://github.com/cloudflare/workers-sdk/pull/1300) [`dcffc93`](https://github.com/cloudflare/workers-sdk/commit/dcffc931d879b0332571ae8ee0c9d4e14c5c3064) Thanks [@threepointone](https://github.com/threepointone)! - feat: `publish --no-build`

  This adds a `--no-build` flag to `wrangler publish`. We've had a bunch of people asking to be able to upload a worker directly, without any modifications. While there are tradeoffs to this approach (any linked modules etc won't work), we understand that people who need this functionality are aware of it (and the usecases that have presented themselves all seem to match this).

* [#1392](https://github.com/cloudflare/workers-sdk/pull/1392) [`ff2e7cb`](https://github.com/cloudflare/workers-sdk/commit/ff2e7cbd5478b6b6ec65f5c507988ff860079337) Thanks [@threepointone](https://github.com/threepointone)! - fix: keep site upload batches under 98 mb

  The maximum _request_ size for a batch upload is 100 MB. We were previously calculating the upload key value to be under _100 MiB_. Further, with a few bytes here and there, the size of the request can exceed 100 MiB. So this fix calculate using MB instead of MiB, but also brings down our own limit to 98 MB so there's some wiggle room for uploads.

  Fixes https://github.com/cloudflare/workers-sdk/issues/1367

- [#1377](https://github.com/cloudflare/workers-sdk/pull/1377) [`a6f1cee`](https://github.com/cloudflare/workers-sdk/commit/a6f1cee08e9aea0e0366b5c15d28e9600df40d27) Thanks [@threepointone](https://github.com/threepointone)! - feat: bind a worker with `[worker_namespaces]`

  This feature les you bind a worker to a dynamic dispatch namespaces, which may have other workers bound inside it. (See https://blog.cloudflare.com/workers-for-platforms/). Inside your `wrangler.toml`, you would add

  ```toml
  [[worker_namespaces]]
  binding = 'dispatcher' # available as env.dispatcher in your worker
  namespace = 'namespace-name' # the name of the namespace being bound
  ```

  Based on work by @aaronlisman in https://github.com/cloudflare/workers-sdk/pull/1310

* [#1297](https://github.com/cloudflare/workers-sdk/pull/1297) [`40036e2`](https://github.com/cloudflare/workers-sdk/commit/40036e22214cc2eaa6fd1f6f977b8bcf38d0ca9e) Thanks [@threepointone](https://github.com/threepointone)! - feat: implement `config.define`

  This implements `config.define`. This lets the user define a map of keys to strings that will be substituted in the worker's source. This is particularly useful when combined with environments. A common usecase is for values that are sent along with metrics events; environment name, public keys, version numbers, etc. It's also sometimes a workaround for the usability of module env vars, which otherwise have to be threaded through request function stacks.

- [`8d68226`](https://github.com/cloudflare/workers-sdk/commit/8d68226fe892530eb9e981f06ac8e1ae00d5bab1) Thanks [@threepointone](https://github.com/threepointone)! - feat: add support for pubsub commands (via @elithrar and @netcli in https://github.com/cloudflare/workers-sdk/pull/1314)

* [#1351](https://github.com/cloudflare/workers-sdk/pull/1351) [`c770167`](https://github.com/cloudflare/workers-sdk/commit/c770167c8403c6c157cdad91e4f2bd2b1f571df2) Thanks [@geelen](https://github.com/geelen)! - feat: add support for CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL to authorise

  This adds support for using the CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL env vars for authorising a user. This also adds support for CF_API_KEY + CF_EMAIL from Wrangler v1, with a deprecation warning.

- [#1352](https://github.com/cloudflare/workers-sdk/pull/1352) [`4e03036`](https://github.com/cloudflare/workers-sdk/commit/4e03036d72ec831036f0f6223d803be99282022f) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - bugfix: Allow route setting to be `""`
  Previously Wrangler v1 behavior had allowed for `route = ""`. To keep parity it will be possible to set `route = ""` in the config file and represent not setting a route, while providing a warning.

  resolves #1329

* [`4ad084e`](https://github.com/cloudflare/workers-sdk/commit/4ad084ef093e39eca4752c615bf19e6479ae448c) Thanks [@sbquinlan](https://github.com/sbquinlan)! - feature By @sbquinlan: Set "upstream" miniflare option when running dev in local mode

- [#1274](https://github.com/cloudflare/workers-sdk/pull/1274) [`5cc0772`](https://github.com/cloudflare/workers-sdk/commit/5cc0772bb8c358c0f39085077ff676dc6738efd3) Thanks [@Maximo-Guk](https://github.com/Maximo-Guk)! - Added .dev.vars support for pages

* [#1349](https://github.com/cloudflare/workers-sdk/pull/1349) [`ef9dac8`](https://github.com/cloudflare/workers-sdk/commit/ef9dac84d4b4c54d0a7d7df002ae8f0117ef0400) Thanks [@rozenmd](https://github.com/rozenmd)! - polish: move preview into its own file

## 2.0.15

### Patch Changes

- [#1301](https://github.com/cloudflare/workers-sdk/pull/1301) [`9074990`](https://github.com/cloudflare/workers-sdk/commit/9074990ead8ce74862601dc9a7c827689e0e3328) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to [`2.5.1`](https://github.com/cloudflare/miniflare/releases/tag/v2.5.1)

* [#1272](https://github.com/cloudflare/workers-sdk/pull/1272) [`f7d362e`](https://github.com/cloudflare/workers-sdk/commit/f7d362e31c83a1a32facfce771d2eb1e261e7b0b) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: print bundle size during `publish` and `dev`

  This logs the complete bundle size of the Worker (as well as when compressed) during `publish` and `dev`.

  Via https://github.com/cloudflare/workers-sdk/issues/405#issuecomment-1156762297)

- [#1287](https://github.com/cloudflare/workers-sdk/pull/1287) [`2072e27`](https://github.com/cloudflare/workers-sdk/commit/2072e278479bf66b255eb2858dea83bf0608530c) Thanks [@f5io](https://github.com/f5io)! - fix: kv:key put/get binary file

  As raised in https://github.com/cloudflare/workers-sdk/issues/1254, it was discovered that binary uploads were being mangled by wrangler 2, whereas they worked in wrangler 1. This is because they were read into a string by providing an explicit encoding of `utf-8`. This fix reads provided files into a node `Buffer` that is then passed directly to the request.

  Subsequently https://github.com/cloudflare/workers-sdk/issues/1273 was raised in relation to a similar issue with gets from wrangler 2. This was happening due to the downloaded file being converted to `utf-8` encoding as it was pushed through `console.log`. By leveraging `process.stdout.write` we can push the fetched `ArrayBuffer` to std out directly without inferring any specific encoding value.

* [#1325](https://github.com/cloudflare/workers-sdk/pull/1325) [`bcd066d`](https://github.com/cloudflare/workers-sdk/commit/bcd066d2ad82c2bfcc97b4394fe7d1e77a17add6) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - fix: Ensure Response is mutable in Pages functions

- [#1265](https://github.com/cloudflare/workers-sdk/pull/1265) [`e322475`](https://github.com/cloudflare/workers-sdk/commit/e32247589bf90e9b8e7a8282ff41f2754a147057) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: support all git versions for `wrangler init`

  If `git` does not support the `--initial-branch` argument then just fallback to the default initial branch name.

  We tried to be more clever about this but there are two many weird corner cases with different git versions on different architectures.
  Now we do our best, with recent versions of git, to ensure that the branch is called `main` but otherwise just make sure we don't crash.

  Fixes #1228

* [#1311](https://github.com/cloudflare/workers-sdk/pull/1311) [`374655d`](https://github.com/cloudflare/workers-sdk/commit/374655d74a2687b54954e706058c1e999d9f16e5) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: add `--text` flag to decode `kv:key get` response values as utf8 strings

  Previously, all kv values were being rendered directly as bytes to the stdout, which makes sense if the value is a binary blob that you are going to pipe into a file, but doesn't make sense if the value is a simple string.

  resolves #1306

- [#1327](https://github.com/cloudflare/workers-sdk/pull/1327) [`4880d54`](https://github.com/cloudflare/workers-sdk/commit/4880d54341ab442d7dca81ae0e0374ef8032fea3) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: resolve `--site` cli arg relative to current working directory

  Before we were resolving the Site directory relative to the location of `wrangler.toml` at all times.
  Now the `--site` cli arg is resolved relative to current working directory.

  resolves #1243

* [#1270](https://github.com/cloudflare/workers-sdk/pull/1270) [`7ed5e1a`](https://github.com/cloudflare/workers-sdk/commit/7ed5e1aaec90cdbacf986fc719cb93b5abf784ae) Thanks [@caass](https://github.com/caass)! - Delegate to a local install of `wrangler` if one exists.

  Users will frequently install `wrangler` globally to run commands like `wrangler init`, but we also recommend pinning a specific version of `wrangler` in a project's `package.json`. Now, when a user invokes a global install of `wrangler`, we'll check to see if they also have a local installation. If they do, we'll delegate to that version.

- [#1289](https://github.com/cloudflare/workers-sdk/pull/1289) [`0d6098c`](https://github.com/cloudflare/workers-sdk/commit/0d6098ca9b28c64be54ced160933894eeed77983) Thanks [@threepointone](https://github.com/threepointone)! - feat: entry point is not mandatory if `--assets` is passed

  Since we use a facade worker with `--assets`, an entry point is not strictly necessary. This makes a common usecase of "deploy a bunch of static assets" extremely easy to start, as a one liner `npx wrangler dev --assets path/to/folder` (and same with `publish`).

* [#1293](https://github.com/cloudflare/workers-sdk/pull/1293) [`ee57d77`](https://github.com/cloudflare/workers-sdk/commit/ee57d77b51d24c94464fada9afe5c80169d0f3c3) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: do not crash in `wrangler dev` if user has multiple accounts

  When a user has multiple accounts we show a prompt to allow the user to select which they should use.
  This was broken in `wrangler dev` as we were trying to start a new ink.js app (to show the prompt)
  from inside a running ink.js app (the UI for `wrangler dev`).

  This fix refactors the `ChooseAccount` component so that it can be used directly within another component.

  Fixes #1258

- [#1299](https://github.com/cloudflare/workers-sdk/pull/1299) [`0fd0c30`](https://github.com/cloudflare/workers-sdk/commit/0fd0c301e538ab1f1dbabbf7cbe203bc03ccc6db) Thanks [@threepointone](https://github.com/threepointone)! - polish: include a copy-pastable message when trying to publish without a compatibility date

* [#1269](https://github.com/cloudflare/workers-sdk/pull/1269) [`fea87cf`](https://github.com/cloudflare/workers-sdk/commit/fea87cf142030c6bbd2647f8aba87479763bfffe) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: do not consider ancestor files when initializing a project with a specified name

  When initializing a new project (via `wrangler init`) we attempt to reuse files in the current
  directory, or in an ancestor directory. In particular we look up the directory tree for
  package.json and tsconfig.json and use those instead of creating new ones.

  Now we only do this if you do not specify a name for the new Worker. If you do specify a name,
  we now only consider files in the directory where the Worker will be initialized.

  Fixes #859

- [#1321](https://github.com/cloudflare/workers-sdk/pull/1321) [`8e2b92f`](https://github.com/cloudflare/workers-sdk/commit/8e2b92f899604b7514ca977c9a591c21964c2dc9) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Correctly resolve directories for 'wrangler pages publish'

  Previously, attempting to publish a nested directory or the current directory would result in parsing mangled paths which broke deployments. This has now been fixed.

* [#1293](https://github.com/cloudflare/workers-sdk/pull/1293) [`ee57d77`](https://github.com/cloudflare/workers-sdk/commit/ee57d77b51d24c94464fada9afe5c80169d0f3c3) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: do not hang waiting for account choice when in non-interactive mode

  The previous tests for non-interactive only checked the stdin.isTTY, but
  you can have scenarios where the stdin is interactive but the stdout is not.
  For example when writing the output of a `kv:key get` command to a file.

  We now check that both stdin and stdout are interactive before trying to
  interact with the user.

- [#1275](https://github.com/cloudflare/workers-sdk/pull/1275) [`35482da`](https://github.com/cloudflare/workers-sdk/commit/35482da2570066cd4764f3f47bfa7a2264e578a6) Thanks [@alankemp](https://github.com/alankemp)! - Add environment variable WRANGLER_LOG to set log level

* [#1294](https://github.com/cloudflare/workers-sdk/pull/1294) [`f6836b0`](https://github.com/cloudflare/workers-sdk/commit/f6836b001b86d1d79cd86c44dcb9376ee29e15bc) Thanks [@threepointone](https://github.com/threepointone)! - fix: serve `--assets` in dev + local mode

  A quick bugfix to make sure --assets/config.assets gets served correctly in `dev --local`.

- [#1237](https://github.com/cloudflare/workers-sdk/pull/1237) [`e1b8ac4`](https://github.com/cloudflare/workers-sdk/commit/e1b8ac410f23bc5923429b8c77b63a93b39b918e) Thanks [@threepointone](https://github.com/threepointone)! - feat: `--assets` / `config.assets` to serve a folder of static assets

  This adds support for defining `assets` in `wrangler.toml`. You can configure it with a string path, or a `{bucket, include, exclude}` object (much like `[site]`). This also renames the `--experimental-public` arg as `--assets`.

  Via https://github.com/cloudflare/workers-sdk/issues/1162

## 2.0.14

### Patch Changes

- [`a4ba42a`](https://github.com/cloudflare/workers-sdk/commit/a4ba42a99caf8a61f618293768e5f5375354f6ee) Thanks [@threepointone](https://github.com/threepointone)! - Revert "Take 2 at moving .npmrc to the root of the repository (#1281)"

- [#1267](https://github.com/cloudflare/workers-sdk/pull/1267) [`c667398`](https://github.com/cloudflare/workers-sdk/commit/c66739841646e0646729e671267e7227ecf1147e) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: let folks know the URL we're opening during login

  Closes #1259

* [#1277](https://github.com/cloudflare/workers-sdk/pull/1277) [`3f3416b`](https://github.com/cloudflare/workers-sdk/commit/3f3416b43f6500708369197802789f4dbe7b6d57) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: bump undici to v5.5.1 (CVE patch)

- [#1260](https://github.com/cloudflare/workers-sdk/pull/1260) [`d8ee04f`](https://github.com/cloudflare/workers-sdk/commit/d8ee04f343303e50c976b676cd06075a971081f2) Thanks [@threepointone](https://github.com/threepointone)! - fix: pass env and ctx to request handler when using `--experimental-public`

* [`1b068c9`](https://github.com/cloudflare/workers-sdk/commit/1b068c99e26c5007e6dbeb26479b1dbd5d4e9a17) Thanks [@threepointone](https://github.com/threepointone)! - Revert "fix: kv:key put upload binary files fix (#1255)"

## 2.0.12

### Patch Changes

- [#1229](https://github.com/cloudflare/workers-sdk/pull/1229) [`e273e09`](https://github.com/cloudflare/workers-sdk/commit/e273e09d41c41f2dfcc1d89c81f6d56933e57102) Thanks [@timabb031](https://github.com/timabb031)! - fix: parsing of node inspector url

  This fixes the parsing of the url returned by Node Inspector via stderr which could be received partially in multiple chunks or in a single chunk.

  Closes #1226

* [#1255](https://github.com/cloudflare/workers-sdk/pull/1255) [`2d806dc`](https://github.com/cloudflare/workers-sdk/commit/2d806dc981a7119de4c0d2c926992cc27e160cae) Thanks [@f5io](https://github.com/f5io)! - fix: kv:key put binary file upload

  As raised in https://github.com/cloudflare/workers-sdk/issues/1254, it was discovered that binary uploads were being mangled by Wrangler v2, whereas they worked in Wrangler v1. This is because they were read into a string by providing an explicit encoding of `utf-8`. This fix reads provided files into a node `Buffer` that is then passed directly to the request.

- [#1248](https://github.com/cloudflare/workers-sdk/pull/1248) [`db8a0bb`](https://github.com/cloudflare/workers-sdk/commit/db8a0bba1f070bce870016a9aecc8b30725694f4) Thanks [@threepointone](https://github.com/threepointone)! - fix: instruct api to exclude script content on worker upload

  When we upload a script bundle, we get the actual content of the script back in the response. Sometimes that script can be large (depending on whether the upload was large), and currently it may even be a badly escaped string. We can pass a queryparam `excludeScript` that, as it implies, exclude the script content in the response. This fix does that.

  Fixes https://github.com/cloudflare/workers-sdk/issues/1222

* [#1250](https://github.com/cloudflare/workers-sdk/pull/1250) [`e3278fa`](https://github.com/cloudflare/workers-sdk/commit/e3278fa9ad15fc0f34322c32eb4bdd557b40c413) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: pass localProtocol to miniflare for https server

  Closes #1247

- [#1253](https://github.com/cloudflare/workers-sdk/pull/1253) [`eee5c78`](https://github.com/cloudflare/workers-sdk/commit/eee5c7815fff8e5a151fc7eda5c1a2496f575b48) Thanks [@threepointone](https://github.com/threepointone)! - fix: resolve asset handler for `--experimental-path`

  In https://github.com/cloudflare/workers-sdk/pull/1241, we removed the vendored version of `@cloudflare/kv-asset-handler`, as well as the build configuration that would point to the vendored version when compiling a worker using `--experimental-public`. However, wrangler can be used where it's not installed in the `package.json` for the worker, or even when there's no package.json at all (like when wrangler is installed globally, or used with `npx`). In this situation, if the user doesn't have `@cloudflare/kv-asset-handler` installed, then building the worker will fail. We don't want to make the user install this themselves, so instead we point to a barrel import for the library in the facade for the worker.

* [#1234](https://github.com/cloudflare/workers-sdk/pull/1234) [`3e94bc6`](https://github.com/cloudflare/workers-sdk/commit/3e94bc6257dbb5e0ff37bca169379b658d8c8761) Thanks [@threepointone](https://github.com/threepointone)! - feat: support `--experimental-public` in local mode

  `--experimental-public` is an abstraction over Workers Sites, and we can leverage miniflare's inbuilt support for Sites to serve assets in local mode.

- [#1236](https://github.com/cloudflare/workers-sdk/pull/1236) [`891d128`](https://github.com/cloudflare/workers-sdk/commit/891d12802c413438b4ce837785abee792e317de1) Thanks [@threepointone](https://github.com/threepointone)! - fix: generate site assets manifest relative to `site.bucket`

  We had a bug where we were generating asset manifest keys incorrectly if we ran wrangler from a different path to `wrangler.toml`. This fixes the generation of said keys, and adds a test for it.

  Fixes #1235

* [#1216](https://github.com/cloudflare/workers-sdk/pull/1216) [`4eb70f9`](https://github.com/cloudflare/workers-sdk/commit/4eb70f906666806250eeb709efa70118df57f2df) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: reload server on configuration changes, the values passed into the server during restart will be `bindings`

  resolves #439

- [#1231](https://github.com/cloudflare/workers-sdk/pull/1231) [`5206c24`](https://github.com/cloudflare/workers-sdk/commit/5206c24630b64a5c398194fd680faa67a5a23c9a) Thanks [@threepointone](https://github.com/threepointone)! - feat: `build.watch_dir` can be an array of paths

  In projects where:

  - all the source code isn't in one folder (like a monorepo, or even where the worker has non-standard imports across folders),
  - we use a custom build, so it's hard to statically determine folders to watch for changes

  ...we'd like to be able to specify multiple paths for custom builds, (the config `build.watch_dir` config). This patch enables such behaviour. It now accepts a single path as before, or optionally an array of strings/paths.

  Fixes https://github.com/cloudflare/workers-sdk/issues/1095

* [#1241](https://github.com/cloudflare/workers-sdk/pull/1241) [`471cfef`](https://github.com/cloudflare/workers-sdk/commit/471cfeffc70088d5db2bdb132357d4dbfedde353) Thanks [@threepointone](https://github.com/threepointone)! - use `@cloudflare/kv-asset-handler` for `--experimental-public`

  We'd previously vendored in `@cloudflare/kv-asset-handler` and `mime` for `--experimental-public`. We've since updated `@cloudflare/kv-asset-handler` to support module workers correctly, and don't need the vendored versions anymore. This patch uses the lib as a dependency, and deletes the `vendor` folder.

## 2.0.11

### Patch Changes

- [#1239](https://github.com/cloudflare/workers-sdk/pull/1239) [`df55709`](https://github.com/cloudflare/workers-sdk/commit/df5570924050298d6fc4dfe09304571472050c1a) Thanks [@threepointone](https://github.com/threepointone)! - polish: don't include folder name in Sites kv asset keys

  As reported in https://github.com/cloudflare/workers-sdk/issues/1189, we're including the name of the folder in the keys of the KV store that stores the assets. This doesn't match v1 behaviour. It makes sense not to include these since, we should be able to move around the folder and not have to reupload the entire folder again.

  Fixes https://github.com/cloudflare/workers-sdk/issues/1189

- [#1210](https://github.com/cloudflare/workers-sdk/pull/1210) [`785d418`](https://github.com/cloudflare/workers-sdk/commit/785d4188916f8aa4c2767500d94bd773a4f9fd45) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Upload the delta for `wrangler pages publish`

  We now keep track of the files that make up each deployment and intelligently only upload the files that we haven't seen. This means that similar subsequent deployments should only need to upload a minority of files and this will hopefully make uploads even faster.

* [#1195](https://github.com/cloudflare/workers-sdk/pull/1195) [`66a85ca`](https://github.com/cloudflare/workers-sdk/commit/66a85ca72de226f1adedce0910954ed5c50c2c7b) Thanks [@threepointone](https://github.com/threepointone)! - fix: batch sites uploads in groups under 100mb

  There's an upper limit on the size of an upload to the bulk kv put api (as specified in https://api.cloudflare.com/#workers-kv-namespace-write-multiple-key-value-pairs). This patch batches sites uploads staying under the 100mb limit.

  Fixes https://github.com/cloudflare/workers-sdk/issues/1187

- [#1218](https://github.com/cloudflare/workers-sdk/pull/1218) [`f8a21ed`](https://github.com/cloudflare/workers-sdk/commit/f8a21ede2034f921b978e4480fe2e6157953a308) Thanks [@threepointone](https://github.com/threepointone)! - fix: warn on unexpected fields on `config.triggers`

  This adds a warning when we find unexpected fields on the `triggers` config (and any future fields that use the `isObjectWith()` validation helper)

## 2.0.9

### Patch Changes

- [#1192](https://github.com/cloudflare/workers-sdk/pull/1192) [`bafa5ac`](https://github.com/cloudflare/workers-sdk/commit/bafa5ac4d466329b3c01dbecf9561a404e70ae02) Thanks [@threepointone](https://github.com/threepointone)! - fix: use worker name as a script ID when generating a preview session

  When generating a preview session on the edge with `wrangler dev`, for a zoned worker we were using a random id as the script ID. This would make the backend not associate the dev session with any resources that were otherwise assigned to the script (specifically for secrets, but other stuff as well) The fix is simply to use the worker name (when available) as the script ID.

  Fixes https://github.com/cloudflare/workers-sdk/issues/1003
  Fixes https://github.com/cloudflare/workers-sdk/issues/1172

* [#1212](https://github.com/cloudflare/workers-sdk/pull/1212) [`101342e`](https://github.com/cloudflare/workers-sdk/commit/101342e33389845545a36158384e7b08b0eafc57) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: do not crash when not logged in and switching to remote dev mode

  Previously, if you are not logged in when running `wrangler dev` it will only try to log you in
  if you start in "remote" mode. In "local" mode there is no need to be logged in, so it doesn't
  bother to try to login, and then will crash if you switch to "remote" mode interactively.

  The problem was that we were only attempting to login once before creating the `<Remote>` component.
  Now this logic has been moved into a `useEffect()` inside `<Remote>` so that it will be run whether
  starting in "remote" or transitioning to "remote" from "local".

  The fact that the check is no longer done before creating the components is proven by removing the
  `mockAccountId()` and `mockApiToken()` calls from the `dev.test.ts` files.

  Fixes [#18](https://github.com/cloudflare/workers-sdk/issues/18)

- [#1188](https://github.com/cloudflare/workers-sdk/pull/1188) [`b44cc26`](https://github.com/cloudflare/workers-sdk/commit/b44cc26546e4b625870ba88b292da548b6a340c0) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: fallback on old zone-based API when account-based route API fails

  While we wait for changes to the CF API to support API tokens that do not have
  "All Zone" permissions, this change provides a workaround for most scenarios.

  If the bulk-route request fails with an authorization error, then we fallback
  to the Wrangler v1 approach, which sends individual route updates via a zone-based
  endpoint.

  Fixes #651

* [#1203](https://github.com/cloudflare/workers-sdk/pull/1203) [`3b88b9f`](https://github.com/cloudflare/workers-sdk/commit/3b88b9f8ea42116b7127ab17a58ce294b876bf81) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: differentiate between API and OAuth in whoami

  Closes #1198

- [#1199](https://github.com/cloudflare/workers-sdk/pull/1199) [`e64812e`](https://github.com/cloudflare/workers-sdk/commit/e64812e1dd38729959ff16abf2a8623543e25896) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - fix: Refresh JWT in wrangler pages publish when it expires

* [#1209](https://github.com/cloudflare/workers-sdk/pull/1209) [`2d42882`](https://github.com/cloudflare/workers-sdk/commit/2d428824260d5015d8eba1b12fd0ef3c7ebfe490) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure wrangler init works with older versions of git

  Rather than using the recently added `--initial-branch` option, we now just renamed the initial branch using `git branch -m main`.

  Fixes https://github.com/cloudflare/workers-sdk/issues/1168

## 2.0.8

### Patch Changes

- [#1184](https://github.com/cloudflare/workers-sdk/pull/1184) [`4a10176`](https://github.com/cloudflare/workers-sdk/commit/4a10176ad1e4856724c70f07f06ef6915ac21ac8) Thanks [@timabb031](https://github.com/timabb031)! - polish: add cron trigger to wrangler.toml when new Scheduled Worker is created

  When `wrangler init` is used to create a new Scheduled Worker a cron trigger (1 \* \* \* \*) will be added to wrangler.toml, but only if wrangler.toml is being created during init. If wrangler.toml exists prior to running `wrangler init` then wrangler.toml will remain unchanged even if the user selects the "Scheduled Handler" option. This is as per existing tests in init.test.ts that ensure wrangler.toml is never overwritten after agreeing to prompts. That can change if it needs to.

* [#1163](https://github.com/cloudflare/workers-sdk/pull/1163) [`52c0bf0`](https://github.com/cloudflare/workers-sdk/commit/52c0bf0469635b76d9717b7113c98572de02d196) Thanks [@threepointone](https://github.com/threepointone)! - fix: only log available bindings once in `dev`

  Because we were calling `printBindings` during the render phase of `<Dev/>`, we were logging the bindings multiple times (render can be called multiple times, and the interaction of Ink's stdout output intermingled with console is a bit weird). We could have put it into an effect, but I think a better solution here is to simply log it before we even start rendering `<Dev/>` (so we could see the bindings even if Dev fails to load, for example).

  This also adds a fix that masks any overriden values so that we don't accidentally log potential secrets into the terminal.

- [#1153](https://github.com/cloudflare/workers-sdk/pull/1153) [`40f20b2`](https://github.com/cloudflare/workers-sdk/commit/40f20b2941e337051e664cf819b4422605925608) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: `minify` and `node_compat` should be inherited

  Fixes [#1150](https://github.com/cloudflare/workers-sdk/issues/1150)

* [#1157](https://github.com/cloudflare/workers-sdk/pull/1157) [`ea8f8d7`](https://github.com/cloudflare/workers-sdk/commit/ea8f8d77ab5370bb43c23b7aad6221a02931ce8b) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - fix: Ignore .git when publishing a Pages project

- [#1171](https://github.com/cloudflare/workers-sdk/pull/1171) [`de4e3c2`](https://github.com/cloudflare/workers-sdk/commit/de4e3c2d4a0b647f190e709a0cadb6ef8eb08530) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: link to the issue chooser in GitHub

  Previously, when an error occurs, wrangler says:

  > If you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new.

  Now, it links through to the issue template chooser which is more helpful.

  Fixes [#1169](https://github.com/cloudflare/workers-sdk/issues/1169)

* [#1154](https://github.com/cloudflare/workers-sdk/pull/1154) [`5d6de58`](https://github.com/cloudflare/workers-sdk/commit/5d6de58a1410bd958e9e3eb4a16c622b58c1a207) Thanks [@threepointone](https://github.com/threepointone)! - fix: extract Cloudflare_CA.pem to temp dir before using it

  With package managers like yarn, the cloudflare cert won't be available on the filesystem as expected (since the module is inside a .zip file). This fix instead extracts the file out of the module, copies it to a temporary directory, and directs node to use that as the cert instead, preventing warnings like https://github.com/cloudflare/workers-sdk/issues/1136.

  Fixes https://github.com/cloudflare/workers-sdk/issues/1136

- [#1166](https://github.com/cloudflare/workers-sdk/pull/1166) [`08e3a49`](https://github.com/cloudflare/workers-sdk/commit/08e3a49985520fc7931f2823c198345ddf956a2f) Thanks [@threepointone](https://github.com/threepointone)! - fix: warn on unexpected fields on migrations

  This adds a warning for unexpected fields on `[migrations]` config, reported in https://github.com/cloudflare/workers-sdk/issues/1165. It also adds a test for incorrect `renamed_classes` in a migration.

* [#1006](https://github.com/cloudflare/workers-sdk/pull/1006) [`ee0c380`](https://github.com/cloudflare/workers-sdk/commit/ee0c38053b4fb198fd4bd71cb7dc1f0aa394ae62) Thanks [@danbulant](https://github.com/danbulant)! - feat: add pnpm support

- [`6187f36`](https://github.com/cloudflare/workers-sdk/commit/6187f36b3ab4646b97af8d058d2abb0e52f580d2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: backslash on manifest keys in windows

* [#1158](https://github.com/cloudflare/workers-sdk/pull/1158) [`e452a35`](https://github.com/cloudflare/workers-sdk/commit/e452a35d4ea17a154c786d9421bd5822ef615c6b) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - fix: Skip cfFetch if there are no functions during pages dev

- [#1122](https://github.com/cloudflare/workers-sdk/pull/1122) [`c2d2f44`](https://github.com/cloudflare/workers-sdk/commit/c2d2f4420cb30f54fc90bd6bf9728adb4bbb0ab2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: display chained errors from the CF API

  For example if you have an invalid CF_API_TOKEN and try running `wrangler whoami`
  you now get the additional `6111` error information:

  ```
  ✘ [ERROR] A request to the Cloudflare API (/user) failed.

    Invalid request headers [code: 6003]
    - Invalid format for Authorization header [code: 6111]
  ```

* [#1161](https://github.com/cloudflare/workers-sdk/pull/1161) [`cec0657`](https://github.com/cloudflare/workers-sdk/commit/cec06573c75834368b95b178f1c276856e207701) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: add User-Agent to all CF API requests

- [#1152](https://github.com/cloudflare/workers-sdk/pull/1152) [`b817136`](https://github.com/cloudflare/workers-sdk/commit/b81713698840a6f87d6ffbf21f8aa1c71a631636) Thanks [@threepointone](https://github.com/threepointone)! - polish: Give a copy-paste config when `[migrations]` are missing

  This gives a slightly better message when migrations are missing for declared durable objcts. Specifically, it gives a copy-pastable section to add to wrangler.toml, and doesn't show the warning at all for invalid class names anymore.

  Partially makes https://github.com/cloudflare/workers-sdk/issues/1076 better.

* [#1141](https://github.com/cloudflare/workers-sdk/pull/1141) [`a8c509a`](https://github.com/cloudflare/workers-sdk/commit/a8c509a200027bea212d461e8d67f7e1940cc71b) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: rename "publish" package.json script to "deploy"

  Renaming the default "publish" package.json script to "deploy" to avoid confusion with npm's publish command.

  Closes #1121

- [#1133](https://github.com/cloudflare/workers-sdk/pull/1133) [`9c29c5a`](https://github.com/cloudflare/workers-sdk/commit/9c29c5a69059b744766fa3c617887707b53992f4) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to [`2.5.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.5.0)

* [#1175](https://github.com/cloudflare/workers-sdk/pull/1175) [`e978986`](https://github.com/cloudflare/workers-sdk/commit/e9789865fa9e80ec61f48aef614e6a74fce258f3) Thanks [@timabb031](https://github.com/timabb031)! - feature: allow user to select a handler template with `wrangler init`

  This allows the user to choose which template they'd like to use when they are prompted to create a new worker.
  The options are currently "None"/"Fetch Handler"/"Scheduled Handler".
  Support for new handler types such as `email` can be added easily in future.

- [#1122](https://github.com/cloudflare/workers-sdk/pull/1122) [`c2d2f44`](https://github.com/cloudflare/workers-sdk/commit/c2d2f4420cb30f54fc90bd6bf9728adb4bbb0ab2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: improve error message when CF API responds with an error

## 2.0.7

### Patch Changes

- [#1110](https://github.com/cloudflare/workers-sdk/pull/1110) [`515a52f`](https://github.com/cloudflare/workers-sdk/commit/515a52fbde910bf83a4964f337bd4f4e8a138705) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: print instructions even if installPackages fails to fetch npm packages

* [#1051](https://github.com/cloudflare/workers-sdk/pull/1051) [`7e2e97b`](https://github.com/cloudflare/workers-sdk/commit/7e2e97b927c0186544e38f66186e2d4fdd136288) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: add support for using wrangler behind a proxy

  Configures the undici library (the library wrangler uses for `fetch`) to send all requests via a proxy selected from the first non-empty environment variable from "https_proxy", "HTTPS_PROXY", "http_proxy" and "HTTP_PROXY".

- [#1089](https://github.com/cloudflare/workers-sdk/pull/1089) [`de59ee7`](https://github.com/cloudflare/workers-sdk/commit/de59ee7d502fa75843584447eb784e76f84d4e50) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: batch package manager installs so folks only have to wait once

  When running `wrangler init`, we install packages as folks confirm their options.
  This disrupts the "flow", particularly on slower internet connections.

  To avoid this disruption, we now only install packages once we're done asking questions.

  Closes #1036

* [#1073](https://github.com/cloudflare/workers-sdk/pull/1073) [`6bb2564`](https://github.com/cloudflare/workers-sdk/commit/6bb2564ddd9c90d75be98dbc524ba2f6b3bd1160) Thanks [@caass](https://github.com/caass)! - Add a better message when a user doesn't have a Chromium-based browser.

  Certain functionality we use in wrangler depends on a Chromium-based browser. Previously, we would throw a somewhat arcane error that was hard (or impossible) to understand without knowing what we needed. While ideally all of our functionality would work across all major browsers, as a stopgap measure we can at least inform the user what the actual issue is.

  Additionally, add support for Brave as a Chromium-based browser.

- [#1079](https://github.com/cloudflare/workers-sdk/pull/1079) [`fb0dec4`](https://github.com/cloudflare/workers-sdk/commit/fb0dec4f022473b7019d4d6dca81aa9fa593eb36) Thanks [@caass](https://github.com/caass)! - Print the bindings a worker has access to during `dev` and `publish`

  It can be helpful for a user to know exactly what resources a worker will have access to and where they can access them, so we now log the bindings available to a worker during `wrangler dev` and `wrangler publish`.

* [#1097](https://github.com/cloudflare/workers-sdk/pull/1097) [`c73a3c4`](https://github.com/cloudflare/workers-sdk/commit/c73a3c44aca8f4716fdc3dbd8f8c3806f452b580) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure all line endings are normalized before parsing as TOML

  Only the last line-ending was being normalized not all of them.

  Fixes https://github.com/cloudflare/workers-sdk/issues/1094

- [#1111](https://github.com/cloudflare/workers-sdk/pull/1111) [`1eaefeb`](https://github.com/cloudflare/workers-sdk/commit/1eaefebd48f0aae89dbf8372cc09eef09ee171a4) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - Git default `main` branch

  polish: Default branch when choosing to initialize a git repository will now be `main`.
  This is inline with current common industry ethical practices.
  See:

  - https://sfconservancy.org/news/2020/jun/23/gitbranchname/
  - https://github.com/github/renaming
  - https://sfconservancy.org/news/2020/jun/23/gitbranchname/

* [#1058](https://github.com/cloudflare/workers-sdk/pull/1058) [`1a59efe`](https://github.com/cloudflare/workers-sdk/commit/1a59efebf4385f3cda58ed9c2575f7878054a319) Thanks [@threepointone](https://github.com/threepointone)! - refactor: detect missing `[migrations]` during config validation

  This does a small refactor -

  - During publish, we were checking whether `[migrations]` were defined in the presence of `[durable_objects]`, and warning if not. This moves it into the config validation step, which means it'll check for all commands (but notably `dev`)
  - It moves the code to determine current migration tag/migrations to upload into a helper. We'll be reusing this soon when we upload migrations to `dev`.

- [#1090](https://github.com/cloudflare/workers-sdk/pull/1090) [`85fbfe8`](https://github.com/cloudflare/workers-sdk/commit/85fbfe8d7c886d39847f4b18fb450c190201befd) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: remove use of `any`

  This "quick-win" refactors some of the code to avoid the use of `any` where possible.
  Using `any` can cause type-checking to be disabled across the code in unexpectedly wide-impact ways.

  There is one other use of `any` not touched here because it is fixed by #1088 separately.

* [#1088](https://github.com/cloudflare/workers-sdk/pull/1088) [`d63d790`](https://github.com/cloudflare/workers-sdk/commit/d63d7904c926babb115927f11df9f8368a89e3aa) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure that the proxy server shuts down to prevent `wrangler dev` from hanging

  When running `wrangler dev` we create a proxy to the actual remote Worker.
  After creating a connection to this proxy by a browser request the proxy did not shutdown.
  Now we use a `HttpTerminator` helper library to force the proxy to close open connections and shutdown correctly.

  Fixes #958

- [#1099](https://github.com/cloudflare/workers-sdk/pull/1099) [`175737f`](https://github.com/cloudflare/workers-sdk/commit/175737fe712c2bae286df59a9a43f1817a05ebec) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: delegate `wrangler build` to `wrangler publish`

  Since `wrangler publish --dry-run --outdir=dist` is basically the same result
  as what Wrangler v1 did with `wrangler build` let's run that for the user if
  they try to run `wrangler build`.

* [#1081](https://github.com/cloudflare/workers-sdk/pull/1081) [`8070763`](https://github.com/cloudflare/workers-sdk/commit/807076374e7f1c4848d8a2bdfe9b28d5cbd9579a) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: friendlier error for when a subdomain hasn't been configured in dev mode

- [#1123](https://github.com/cloudflare/workers-sdk/pull/1123) [`15e5c12`](https://github.com/cloudflare/workers-sdk/commit/15e5c129909fa5a81ef0167b4ec9009b550b9f11) Thanks [@timabb031](https://github.com/timabb031)! - chore: updated new worker ts template with env/ctx parameters and added Env interface

* [#1080](https://github.com/cloudflare/workers-sdk/pull/1080) [`4a09c1b`](https://github.com/cloudflare/workers-sdk/commit/4a09c1b3ff2cf6d69a7ba71453663606ae0c6a5c) Thanks [@caass](https://github.com/caass)! - Improve messaging when bulk deleting or uploading KV Pairs

  Closes #555

- [#1000](https://github.com/cloudflare/workers-sdk/pull/1000) [`5a8e8d5`](https://github.com/cloudflare/workers-sdk/commit/5a8e8d56fab5a86b7c7cc32bfd6fdacf7febf20a) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - `pages dev <dir>` & `wrangler pages functions build` will have a `--node-compat` flag powered by @esbuild-plugins/node-globals-polyfill (which in itself is powered by rollup-plugin-node-polyfills). The only difference in `pages` will be it does not check the `wrangler.toml` so the `node_compat = true`will not enable it for `wrangler pages` functionality.

  resolves #890

* [#1028](https://github.com/cloudflare/workers-sdk/pull/1028) [`b7a9ce6`](https://github.com/cloudflare/workers-sdk/commit/b7a9ce60244e18b74533aaeeff6ae282a82892f1) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Use new bulk upload API for 'wrangler pages publish'

  This raises the file limit back up to 20k for a deployment.

## 2.0.6

### Patch Changes

- [#1018](https://github.com/cloudflare/workers-sdk/pull/1018) [`cd2c42f`](https://github.com/cloudflare/workers-sdk/commit/cd2c42fca02bff463d78398428dcf079a80e2ae6) Thanks [@threepointone](https://github.com/threepointone)! - fix: strip leading `*`/`*.` from routes when deducing a host for `dev`

  When given routes, we use the host name from the route to deduce a zone id to pass along with the host to set with dev `session`. Route patterns can include leading `*`/`*.`, which we don't account for when deducing said zone id, resulting in subtle errors for the session. This fix strips those leading characters as appropriate.

  Fixes https://github.com/cloudflare/workers-sdk/issues/1002

* [#1044](https://github.com/cloudflare/workers-sdk/pull/1044) [`7a191a2`](https://github.com/cloudflare/workers-sdk/commit/7a191a2fd0cb08f2a80c29703a307286264ef74f) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: trim trailing whitespace from the secrets before uploading

  resolves #993

- [#1052](https://github.com/cloudflare/workers-sdk/pull/1052) [`233eef2`](https://github.com/cloudflare/workers-sdk/commit/233eef2081d093b08ec02e68445c5e9c26ebe58c) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: display the correct help information when a subcommand is invalid

  Previously, when an invalid subcommand was used, such as `wrangler r2 foo`,
  the help that was displayed showed the top-level commands prefixed by the command in used.
  E.g.

  ```
  wrangler r2 init [name]       📥 Create a wrangler.toml configuration file
  wrangler r2 dev [script]      👂 Start a local server for developing your worker
  wrangler r2 publish [script]  🆙 Publish your Worker to Cloudflare.
  ...
  ```

  Now the correct command help is displayed:

  ```
  $ wrangler r2 foo

  ✘ [ERROR] Unknown argument: foo
  ```

wrangler r2

📦 Interact with an R2 store

Commands:
wrangler r2 bucket Manage R2 buckets

Flags:
-c, --config Path to .toml configuration file [string]
-h, --help Show help [boolean]
-v, --version Show version number [boolean]

````

Fixes #871

* [#906](https://github.com/cloudflare/workers-sdk/pull/906) [`3279f10`](https://github.com/cloudflare/workers-sdk/commit/3279f103fb3b1c27addb4c69c30ad970ab0d5f77) Thanks [@threepointone](https://github.com/threepointone)! - feat: implement support for service bindings

This adds experimental support for service bindings, aka worker-to-worker bindings. It's lets you "call" a worker from another worker, without incurring any network cost, and (ideally) with much less latency. To use it, define a `[services]` field in `wrangler.toml`, which is a map of bindings to worker names (and environment). Let's say you already have a worker named "my-worker" deployed. In another worker's configuration, you can create a service binding to it like so:

```toml
[[services]]
binding = "MYWORKER"
service = "my-worker"
environment = "production" # optional, defaults to the worker's `default_environment` for now
````

And in your worker, you can call it like so:

```js
export default {
	fetch(req, env, ctx) {
		return env.MYWORKER.fetch(new Request("http://domain/some-path"));
	},
};
```

Fixes https://github.com/cloudflare/workers-sdk/issues/1026

- [#1045](https://github.com/cloudflare/workers-sdk/pull/1045) [`8eeef9a`](https://github.com/cloudflare/workers-sdk/commit/8eeef9ace652ffad3be0116f6f58c71dc251e49c) Thanks [@jrf0110](https://github.com/jrf0110)! - fix: Incorrect extension extraction from file paths.

  Our extension extraction logic was taking into account folder names, which can include periods. The logic would incorrectly identify a file path of .well-known/foo as having the extension of well-known/foo when in reality it should be an empty string.

* [#1039](https://github.com/cloudflare/workers-sdk/pull/1039) [`95852c3`](https://github.com/cloudflare/workers-sdk/commit/95852c304716e8b9b97ef2a5486c8337cc278f1d) Thanks [@threepointone](https://github.com/threepointone)! - fix: don't fetch migrations when in `--dry-run` mode

  Fixes https://github.com/cloudflare/workers-sdk/issues/1038

- [#1033](https://github.com/cloudflare/workers-sdk/pull/1033) [`ffce3e3`](https://github.com/cloudflare/workers-sdk/commit/ffce3e3fa1bf04a1597d4fd1c6ef5ed536b81308) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: `wrangler init` should not crash if Git is not available on Windows

  We check for the presence of Git by trying to run `git --version`.
  On non-Windows we get an Error with `code` set to "ENOENT".
  One Windows we get a different error:

  ```
  {
    "shortMessage":"Command failed with exit code 1: git --version",
    "command":"git --version",
    "escapedCommand":"git --version",
    "exitCode":1,
    "stdout":"",
    "stderr":"'git' is not recognized as an internal or external command,\r\noperable program or batch file.",
    "failed":true,
    "timedOut":false,
    "isCanceled":false,
    "killed":false
  }
  ```

  Since we don't really care what the error is, now we just assume that Git
  is not available if an error is thrown.

  Fixes #1022

* [#982](https://github.com/cloudflare/workers-sdk/pull/982) [`6791703`](https://github.com/cloudflare/workers-sdk/commit/6791703abc6f9e61a7f954db48d53c6994c80e03) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - feature: add support for publishing to Custom Domains

  With the release of Custom Domains for workers, users can publish directly to a custom domain on a route, rather than creating a dummy DNS record first and manually pointing the worker over - this adds the same support to wrangler.

  Users declare routes as normal, but to indicate that a route should be treated as a custom domain, a user simply uses the object format in the toml file, but with a new key: custom_domain (i.e. `routes = [{ pattern = "api.example.com", custom_domain = true }]`)

  When wrangler sees a route like this, it peels them off from the rest of the routes and publishes them separately, using the /domains api. This api is very defensive, erroring eagerly if there are conflicts in existing Custom Domains or managed DNS records. In the case of conflicts, wrangler prompts for confirmation, and then retries with parameters to indicate overriding is allowed.

- [#1019](https://github.com/cloudflare/workers-sdk/pull/1019) [`5816eba`](https://github.com/cloudflare/workers-sdk/commit/5816ebae462a5ec9252b9df1b46ace3204bc81e8) Thanks [@threepointone](https://github.com/threepointone)! - feat: bind a durable object by environment

  For durable objects, instead of just `{ name, class_name, script_name}`, this lets you bind by environment as well, like so `{ name, class_name, script_name, environment }`.

  Fixes https://github.com/cloudflare/workers-sdk/issues/996

* [#1057](https://github.com/cloudflare/workers-sdk/pull/1057) [`608dcd9`](https://github.com/cloudflare/workers-sdk/commit/608dcd940ba2096d975dbbbedb63c34943617d4a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: pages "command" can consist of multiple words

  On Windows, the following command `wrangler pages dev -- foo bar` would error
  saying that `bar` was not a known argument. This is because `foo` and `bar` are
  passed to Yargs as separate arguments.

  A workaround is to put the command in quotes: `wrangler pages dev -- "foo bar"`.
  But this fix makes the `command` argument variadic, which also solves the problem.

  Fixes [#965](https://github.com/cloudflare/workers-sdk/issues/965)

- [#1027](https://github.com/cloudflare/workers-sdk/pull/1027) [`3545e41`](https://github.com/cloudflare/workers-sdk/commit/3545e419a70f4f0d5dd305972bf63acf11f91d5c) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: trying to use node builtins should recommend you enable node_compat in wrangler.toml

* [#1024](https://github.com/cloudflare/workers-sdk/pull/1024) [`110f340`](https://github.com/cloudflare/workers-sdk/commit/110f340061918026938cda2aba158276386fe6e9) Thanks [@threepointone](https://github.com/threepointone)! - polish: validate payload for `kv:bulk put` on client side

  This adds client side validation for the paylod for `kv:bulk put`, importantly ensuring we're uploading only string key/value pairs (as well as validation for the other fields).

  Fixes https://github.com/cloudflare/workers-sdk/issues/571

- [#1037](https://github.com/cloudflare/workers-sdk/pull/1037) [`963e9e0`](https://github.com/cloudflare/workers-sdk/commit/963e9e08e52f7871923bded3fd5c2cb2ec452532) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: don't attempt to login during a --dryRun

## 2.0.5

### Patch Changes

- [`556e6dd`](https://github.com/cloudflare/workers-sdk/commit/556e6dda27b6800353fc709d02763cc47448198e) Thanks [@threepointone](https://github.com/threepointone)! - chore: bump to do a release

## 2.0.4

### Patch Changes

- [#987](https://github.com/cloudflare/workers-sdk/pull/987) [`bb94038`](https://github.com/cloudflare/workers-sdk/commit/bb94038b0f18306cf44ef598bd505e799d3c688e) Thanks [@threepointone](https://github.com/threepointone)! - fix: encode key when calling `kv:ket get`, don't encode when deleting a namespace

  This cleans up some logic from https://github.com/cloudflare/workers-sdk/pull/964.

  - we shouldn't be encoding the id when deleting a namespace, since that'll already be an alphanumeric id
  - we should be encoding the key when we call kv:key get, or we get a similar issue as in https://github.com/cloudflare/workers-sdk/issues/961
  - adds `KV` to all the KV-related function names
  - moves the api calls to `kv:namespace delete` and `kv:key delete` inside `kv.ts` helpers.

* [#980](https://github.com/cloudflare/workers-sdk/pull/980) [`202f37d`](https://github.com/cloudflare/workers-sdk/commit/202f37d99c8bff8f1031d7ff0910e9641357e3ac) Thanks [@threepointone](https://github.com/threepointone)! - fix: throw appropriate error when we detect an unsupported version of node

  When we start up the CLI, we check what the minimum version of supported node is, and throw an error if it isn't at least 16.7. However, the script that runs this, imports `node:child_process` and `node:path`, which was only introduced in 16.7. It was backported to older versions of node, but only in last updates to majors. So for example, if someone used 14.15.4, the script would throw because it wouldn't be able to find `node:child_process` (but it _would_ work on v14.19.2).

  The fix here is to not use the prefixed versions of these built-ins in the bootstrap script. Fixes https://github.com/cloudflare/workers-sdk/issues/979

## 2.0.3

### Patch Changes

- [#956](https://github.com/cloudflare/workers-sdk/pull/956) [`1caa5f7`](https://github.com/cloudflare/workers-sdk/commit/1caa5f764100156a8d8e25347036b05e2b0210f6) Thanks [@threepointone](https://github.com/threepointone)! - fix: don't crash during `init` if `git` is not installed

  When a command isn't available on a system, calling `execa()` on it throws an error, and not just a non zero exitCode. This patch fixes the flow so we don't crash the whole process when that happens on testing the presence of `git` when calling `wrangler init`.

  Fixes https://github.com/cloudflare/workers-sdk/issues/950

* [#970](https://github.com/cloudflare/workers-sdk/pull/970) [`35e780b`](https://github.com/cloudflare/workers-sdk/commit/35e780b0dddee81323963b2362c38261b65473c0) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Fixes Pages Plugins and static asset routing.

  There was previously a bug where a relative pathname would be missing the leading slash which would result in routing errors.

- [#957](https://github.com/cloudflare/workers-sdk/pull/957) [`e0a0509`](https://github.com/cloudflare/workers-sdk/commit/e0a05094493f1327b6790e66b6dcbff2d579628c) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - refactor: Moving `--legacy-env` out of global
  The `--legacy-env` flag was in global scope, which only certain commands
  utilize the flag for functionality, and doesnt do anything for the other commands.

  resolves #933

* [#948](https://github.com/cloudflare/workers-sdk/pull/948) [`82165c5`](https://github.com/cloudflare/workers-sdk/commit/82165c56a3d13bf466767e06500738bb97e61d6e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: improve error message if custom build output is not found

  The message you get if Wrangler cannot find the output from the custom build is now more helpful.
  It will even look around to see if there is a suitable file nearby and make suggestions about what should be put in the `main` configuration.

  Closes [#946](https://github.com/cloudflare/workers-sdk/issues/946)

- [#952](https://github.com/cloudflare/workers-sdk/pull/952) [`ae3895e`](https://github.com/cloudflare/workers-sdk/commit/ae3895eea63518242b2660e6b52790f922566a78) Thanks [@d3lm](https://github.com/d3lm)! - feat: use host specific callback url

  To allow OAuth to work on environments such as WebContainer we have to generate a host-specific callback URL. This PR uses `@webcontainer/env` to generate such URL only for running in WebContainer. Otherwise the callback URL stays unmodified.

* [#951](https://github.com/cloudflare/workers-sdk/pull/951) [`09196ec`](https://github.com/cloudflare/workers-sdk/commit/09196ec6362fb8651d7d20bdc2a7a14792c6fda5) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: look for an alternate port in the dev command if the configured one is in use

  Previously, we were only calling `getPort()` if the configured port was undefined.
  But since we were setting the default for this during validation, it was never undefined.

  Fixes [#949](https://github.com/cloudflare/workers-sdk/issues/949)

- [#963](https://github.com/cloudflare/workers-sdk/pull/963) [`5b03eb8`](https://github.com/cloudflare/workers-sdk/commit/5b03eb8cdec6f16c67a47f20472e098659395888) Thanks [@threepointone](https://github.com/threepointone)! - fix: work with Cloudflare WARP

  Using wrangler with Cloudflare WARP (https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/) requires using the Cloudflare certificate. This patch simply uses the certificate as NODE_EXTRA_CA_CERTS when we start wrangler.

  Test plan:

  - Turn on Cloudflare WARP/ Gateway with WARP
  - `wrangler dev`
  - Turn on Cloudflare WARP/ Gateway with DoH
  - `wrangler dev`
  - Turn off Cloudflare WARP
  - `wrangler dev`

  Fixes https://github.com/cloudflare/workers-sdk/issues/953, https://github.com/cloudflare/workers-sdk/issues/850

* [#964](https://github.com/cloudflare/workers-sdk/pull/964) [`0dfd95f`](https://github.com/cloudflare/workers-sdk/commit/0dfd95ff02ae72a34c8de6f5844a4208cb8fb7bf) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: KV not setting correctly
  The KV has URL inputs, which in the case of `/` would get collapsed and lost.
  T:o handle special characters `encodeURIComponent` is implemented.

  resolves #961

## 2.0.2

### Patch Changes

- [#947](https://github.com/cloudflare/workers-sdk/pull/947) [`38b7242`](https://github.com/cloudflare/workers-sdk/commit/38b7242621eb26fef9910ce4a161d26baff08d0a) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Updated defaults and help of wrangler pages publish

* [#941](https://github.com/cloudflare/workers-sdk/pull/941) [`d84b568`](https://github.com/cloudflare/workers-sdk/commit/d84b568818cf1ec4654aec806b27c40681df9c7b) Thanks [@threepointone](https://github.com/threepointone)! - fix: bundle worker as iife if detected as a service worker

  We detect whether a worker is a "modules" format worker by the presence of a `default` export. This is a pretty good heuristic overall, but sometimes folks can make mistakes. One situation that's popped up a few times, is people writing exports, but still writing it in "service worker" format. We detect this fine, and log a warning about the exports, but send it up with the exports included. Unfortunately, our runtime throws when we mark a worker as a service worker, but still has exports. This patch fixes it so that the exports are not included in a service-worker worker.

  Note that if you're missing an event listener, it'll still error with "No event handlers were registered. This script does nothing." but that's a better error than the SyntaxError _even when the listener was there_.

  Fixes https://github.com/cloudflare/workers-sdk/issues/937

## 2.0.1

### Patch Changes

- [#932](https://github.com/cloudflare/workers-sdk/pull/932) [`e95e5a0`](https://github.com/cloudflare/workers-sdk/commit/e95e5a0a4e6848a747cba067ad7c095d672f0f55) Thanks [@threepointone](https://github.com/threepointone)! - fix: log proper response status codes in `dev`

  During `dev` we log the method/url/statuscode for every req+res. This fix logs the correct details for every request.

  Fixes https://github.com/cloudflare/workers-sdk/issues/931

* [#930](https://github.com/cloudflare/workers-sdk/pull/930) [`bc28bea`](https://github.com/cloudflare/workers-sdk/commit/bc28bea376260abb6fed996698436fb11e7840fc) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Default to creating a new project when no existing ones are available for 'wrangler pages publish'

- [#934](https://github.com/cloudflare/workers-sdk/pull/934) [`692ddc4`](https://github.com/cloudflare/workers-sdk/commit/692ddc4f1a3770758a8199bbdcd0abee108c3a2c) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Suppress beta warning when operating in Pages' CI environment

* [#936](https://github.com/cloudflare/workers-sdk/pull/936) [`a0e0b26`](https://github.com/cloudflare/workers-sdk/commit/a0e0b2696f498e0d7913e8ffd3db5abd025e7085) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: support Windows line-endings in TOML files

  The TOML parser that Wrangler uses crashes if there is a Windows line-ending in a comment.
  See https://github.com/iarna/iarna-toml/issues/33.

  According to the TOML spec, we should be able to normalize line-endings as we see fit.
  See https://toml.io/en/v1.0.0#:~:text=normalize%20newline%20to%20whatever%20makes%20sense.

  This change normalizes line-endings of TOML strings before parsing to avoid hitting this bug.

  Fixes https://github.com/cloudflare/workers-sdk/issues/915

## 2.0.0

### Major Changes

- [#928](https://github.com/cloudflare/workers-sdk/pull/928) [`7672f99`](https://github.com/cloudflare/workers-sdk/commit/7672f99b0d69b9bdcc149f54388b52f0f890f8f8) Thanks [@threepointone](https://github.com/threepointone)! - ⛅️ Wrangler 2.0.0

  Wrangler 2.0 is a full rewrite. Every feature has been improved, while retaining as much backward compatibility as we could. We hope you love it. It'll only get better.

## 0.0.34

### Patch Changes

- [#926](https://github.com/cloudflare/workers-sdk/pull/926) [`7b38a7c`](https://github.com/cloudflare/workers-sdk/commit/7b38a7c3e5df293167380002489c821c7c0a5553) Thanks [@threepointone](https://github.com/threepointone)! - polish: show paths of created files with `wrangler init`

  This patch modifies the terminal when running `wrangler init`, to show the proper paths of files created during it (like `package.json`, `tsconfig.json`, etc etc). It also fixes a bug where we weren't detecting the existence of `src/index.js` for a named worker before asking to create it.

## 0.0.33

### Patch Changes

- [#924](https://github.com/cloudflare/workers-sdk/pull/924) [`3bdba63`](https://github.com/cloudflare/workers-sdk/commit/3bdba63c49ad71a6d6d524751b0a05dc592fde59) Thanks [@threepointone](https://github.com/threepointone)! - fix: with`wrangler init`, test for existence of `package.json`/ `tsconfig.json` / `.git` in the right locations

  When running `wrangler.init`, we look for the existence of `package.json`, / `tsconfig.json` / `.git` when deciding whether we should create them ourselves or not. Because `name` can be a relative path, we had a bug where we don't starting look from the right directory. We also had a bug where we weren't even testing for the existence of the `.git` directory correctly. This patch fixes that initial starting location, tests for `.git` as a directory, and correctly decides when to create those files.

## 0.0.32

### Patch Changes

- [#922](https://github.com/cloudflare/workers-sdk/pull/922) [`e2f9bb2`](https://github.com/cloudflare/workers-sdk/commit/e2f9bb2bad7fcb64ad284da7dec5d91778c8a09b) Thanks [@threepointone](https://github.com/threepointone)! - feat: offer to create a git repo when calling `wrangler init`

  Worker projects created by `wrangler init` should also be managed by source control (popularly, git). This patch adds a choice in `wrangler init` to make the created project into a git repository.

  Additionally, this fixes a bug in our tests where mocked `confirm()` and `prompt()` calls were leaking between tests.

  Closes https://github.com/cloudflare/workers-sdk/issues/847

## 0.0.31

### Patch Changes

- [#916](https://github.com/cloudflare/workers-sdk/pull/916) [`4ef5fbb`](https://github.com/cloudflare/workers-sdk/commit/4ef5fbbb2866de403cb613b742ef2042d12feebd) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: display and error and help for `wrangler init --site`

  The `--site` option is no longer supported.
  This change adds information about how to create a new Sites project
  by cloning a repository.
  It also adds links to the Worker Sites and Cloudflare Pages docs.

* [#908](https://github.com/cloudflare/workers-sdk/pull/908) [`f8dd31e`](https://github.com/cloudflare/workers-sdk/commit/f8dd31e322774180b371c6af15b4bfbd92a58284) Thanks [@threepointone](https://github.com/threepointone)! - fix: fix isolate prewarm logic for `wrangler dev`

  When calling `wrangler dev`, we make a request to a special URL that "prewarms" the isolate running our Worker so that we can attach devtools etc to it before actually making a request. We'd implemented it wrongly, and because we'd silenced its errors, we weren't catching it. This patch fixes the logic (based on Wrangler v1.x's implementation) and enables logging errors when the prewarm request fails.

  As a result, profiling starts working again as expected. Fixes https://github.com/cloudflare/workers-sdk/issues/907

- [#919](https://github.com/cloudflare/workers-sdk/pull/919) [`13078e1`](https://github.com/cloudflare/workers-sdk/commit/13078e147f49c5054fc87dc4ab5a5f2028b93f5a) Thanks [@threepointone](https://github.com/threepointone)! - fix: don't crash when tail event is null

  Sometime the "event" on a tail can be null. This patch makes sure we don't crash when that happens. Fixes https://github.com/cloudflare/workers-sdk/issues/918

* [#913](https://github.com/cloudflare/workers-sdk/pull/913) [`dfeed74`](https://github.com/cloudflare/workers-sdk/commit/dfeed74ee4c07d1e3c2e1b91ad5ccaa68fc9c120) Thanks [@threepointone](https://github.com/threepointone)! - polish: add a deprecation warning to `--inspect` on `dev`

  We have a blogposts and docs that says you need to pass `--inspect` to use devtools and/or profile your Worker. In wrangler v2, we don't need to pass the flag anymore. Using it right now will throw an error, so this patch makes it a simple warning instead.

- [#916](https://github.com/cloudflare/workers-sdk/pull/916) [`4ef5fbb`](https://github.com/cloudflare/workers-sdk/commit/4ef5fbbb2866de403cb613b742ef2042d12feebd) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add some space after the CLI help message when there is an error

* [#920](https://github.com/cloudflare/workers-sdk/pull/920) [`57cf221`](https://github.com/cloudflare/workers-sdk/commit/57cf221179661a5a6dd448086cdd019fac55e822) Thanks [@threepointone](https://github.com/threepointone)! - chore: don't minify bundles

  When errors in wrangler happen, it's hard to tell where the error is coming from in a minified bundle. This patch removes the minification. We still set `process.env.NODE_ENV = 'production'` in the bundle so we don't run dev-only paths in things like React.

  This adds about 2 mb to the bundle, but imo it's worth it.

- [#916](https://github.com/cloudflare/workers-sdk/pull/916) [`4ef5fbb`](https://github.com/cloudflare/workers-sdk/commit/4ef5fbbb2866de403cb613b742ef2042d12feebd) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: update the `generate` command to provide better deprecation messaging

* [#914](https://github.com/cloudflare/workers-sdk/pull/914) [`9903526`](https://github.com/cloudflare/workers-sdk/commit/9903526d03891dadfbe0d75dd21dcc0e118f9f73) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - fix: Ensure getting git branch doesn't fail on Windows

- [#917](https://github.com/cloudflare/workers-sdk/pull/917) [`94d3d6d`](https://github.com/cloudflare/workers-sdk/commit/94d3d6d3efa525f31b1c519067cce9f88fb8490b) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Hit correct endpoint for 'wrangler pages publish'

* [#910](https://github.com/cloudflare/workers-sdk/pull/910) [`fe0344d`](https://github.com/cloudflare/workers-sdk/commit/fe0344d894fa65a623966710914ef21f542341e1) Thanks [@taylorlee](https://github.com/taylorlee)! - fix: support preview buckets for r2 bindings

  Allows wrangler2 to perform preview & dev sessions with a different bucket than the published worker's binding.

  This matches kv's preview_id behavior, and brings the Wrangler v2 implementation in sync with Wrangler v1.

## 0.0.30

### Patch Changes

- [#902](https://github.com/cloudflare/workers-sdk/pull/902) [`daed3c3`](https://github.com/cloudflare/workers-sdk/commit/daed3c3d09c7416ef46a8f12e9c2c1ec9ff5cbd3) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: show error if a string option is used without a value

  Fixes #883

* [#901](https://github.com/cloudflare/workers-sdk/pull/901) [`b246066`](https://github.com/cloudflare/workers-sdk/commit/b24606696a18bb2183072b9a1e0e0dc57371791c) Thanks [@threepointone](https://github.com/threepointone)! - chore: minify bundle, don't ship sourcemaps

  We haven't found much use for sourcemaps in production, and we should probably minify the bundle anyway. This will also remove an dev only warnings react used to log.

- [#904](https://github.com/cloudflare/workers-sdk/pull/904) [`641cdad`](https://github.com/cloudflare/workers-sdk/commit/641cdadb5168af7b5be042ccc394ddf501e8475d) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Adds 'assets:' loader for Pages Functions.

  This lets users and Plugin authors include a folder of static assets in Pages Functions.

  ```ts
  export { onRequest } from "assets:../folder/of/static/assets";
  ```

  More information in [our docs](https://developers.cloudflare.com/pages/platform/functions/plugins/).

* [#905](https://github.com/cloudflare/workers-sdk/pull/905) [`c57ff0e`](https://github.com/cloudflare/workers-sdk/commit/c57ff0e3fdd8c13156e6f9973fba30da56694ce2) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - chore: removed Sentry and related reporting code. Automated reporting of Wrangler errors will be reimplemented after further planning.

## 0.0.29

### Patch Changes

- [#897](https://github.com/cloudflare/workers-sdk/pull/897) [`d0801b7`](https://github.com/cloudflare/workers-sdk/commit/d0801b77c3d10526041e1962679b2fd2283a8ac4) Thanks [@threepointone](https://github.com/threepointone)! - polish: tweak the message when `.dev.vars` is used

  This tweaks the mssage when a `.dev.vars` file is used so that it doesn't imply that the user has to copy the values from it into their `wrangler.toml`.

* [#880](https://github.com/cloudflare/workers-sdk/pull/880) [`aad1418`](https://github.com/cloudflare/workers-sdk/commit/aad1418a388edddc2096c20b48fb37cdff7c51ff) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Stop unnecessarily amalgamating duplicate headers in Pages Functions

  Previously, `set-cookie` multiple headers would be combined because of unexpected behavior in [the spec](https://github.com/whatwg/fetch/pull/1346).

- [#892](https://github.com/cloudflare/workers-sdk/pull/892) [`b08676a`](https://github.com/cloudflare/workers-sdk/commit/b08676a64df933eeb38439a6e7a5094b4d3c34f7) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Adds the leading slash to Pages deployment manifests that the API expects, and fixes manifest generation on Windows machines.

* [#852](https://github.com/cloudflare/workers-sdk/pull/852) [`6283ad5`](https://github.com/cloudflare/workers-sdk/commit/6283ad54bf77547b6fbb49cababb996bccadfd6e) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: non-TTY check for required variables
  Added a check in non-TTY environments for `account_id`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. If `account_id` exists in `wrangler.toml`
  then `CLOUDFLARE_ACCOUNT_ID` is not needed in non-TTY scope. The `CLOUDFLARE_API_TOKEN` is necessary in non-TTY scope and will always error if missing.

  resolves #827

- [#893](https://github.com/cloudflare/workers-sdk/pull/893) [`5bf17ca`](https://github.com/cloudflare/workers-sdk/commit/5bf17ca81fd9627f4f7486607b1283aab2da30fe) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: remove bold font from additional lines of warnings and errors

  Previously, when a warning or error was logged, the entire message
  was formatted in bold font. This change makes only the first line of
  the message bold, and the rest is formatted with a normal font.

* [#894](https://github.com/cloudflare/workers-sdk/pull/894) [`57c1354`](https://github.com/cloudflare/workers-sdk/commit/57c1354f92a9f4bf400120d5c607a5838febca76) Thanks [@threepointone](https://github.com/threepointone)! - polish: s/DO NOT USE THIS/ Ignored

  Followup to https://github.com/cloudflare/workers-sdk/pull/888, this replaces some more scary capitals with a more chill word.

- [#893](https://github.com/cloudflare/workers-sdk/pull/893) [`5bf17ca`](https://github.com/cloudflare/workers-sdk/commit/5bf17ca81fd9627f4f7486607b1283aab2da30fe) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add bold to the `Deprecated` warning title

* [#882](https://github.com/cloudflare/workers-sdk/pull/882) [`1ad7570`](https://github.com/cloudflare/workers-sdk/commit/1ad757026814cebab67910a136d7be5c95c7bae6) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add support for reading build time env variables from a `.env` file

  This change will automatically load up a `.env` file, if found, and apply its
  values to the current environment. An example would be to provide a specific
  CLOUDFLARE_ACCOUNT_ID value.

  Related to cloudflare#190

- [#887](https://github.com/cloudflare/workers-sdk/pull/887) [`2bb4d30`](https://github.com/cloudflare/workers-sdk/commit/2bb4d30e0c50ec1c3d9d821c768fc711e8be4ca9) Thanks [@threepointone](https://github.com/threepointone)! - polish: accept Enter as a valid key in confirm dialogs

  Instead of logging "Unrecognised input" when hitting return/enter in a confirm dialog, we should accept it as a confirmation. This patch also makes the default choice "y" bold in the dialog.

* [#891](https://github.com/cloudflare/workers-sdk/pull/891) [`bae5ba4`](https://github.com/cloudflare/workers-sdk/commit/bae5ba451811f7ec37f7355463aab9163b4299f8) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Adds interactive prompts for the 'wrangler pages publish' and related commands.

  Additionally, those commands now read from `node_modules/.cache/wrangler/pages.json` to persist users' account IDs and project names.

- [#888](https://github.com/cloudflare/workers-sdk/pull/888) [`b77aa38`](https://github.com/cloudflare/workers-sdk/commit/b77aa38e01d743d05f3f6e79a5786fb46bbdafc4) Thanks [@threepointone](https://github.com/threepointone)! - polish: s/DEPRECATION/Deprecation

  This removes the scary uppercase from DEPRECATION warnings. It also moves the service environment usage warning into `diagnostics` instead of logging it directly.

* [#879](https://github.com/cloudflare/workers-sdk/pull/879) [`f694313`](https://github.com/cloudflare/workers-sdk/commit/f6943132a04f17af68e2070756d1ec2aa2bdf0be) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: read `vars` overrides from a local file for `wrangler dev`

  The `vars` bindings can be specified in the `wrangler.toml` configuration file.
  But "secret" `vars` are usually only provided at the server -
  either by creating them in the Dashboard UI, or using the `wrangler secret` command.

  It is useful during development, to provide these types of variable locally.
  When running `wrangler dev` we will look for a file called `.dev.vars`, situated
  next to the `wrangler.toml` file (or in the current working directory if there is no
  `wrangler.toml`). Any values in this file, formatted like a `dotenv` file, will add to
  or override `vars` bindings provided in the `wrangler.toml`.

  Related to #190

## 0.0.28

### Patch Changes

- [#843](https://github.com/cloudflare/workers-sdk/pull/843) [`da12cc5`](https://github.com/cloudflare/workers-sdk/commit/da12cc55a571eb30480fb21324002f682137b836) Thanks [@threepointone](https://github.com/threepointone)! - fix: `site.entry-point` is no longer a hard deprecation

  To make migration of v1 projects easier, Sites projects should still work, including the `entry-point` field (which currently errors out). This enables `site.entry-point` as a valid entry point, with a deprecation warning.

* [#848](https://github.com/cloudflare/workers-sdk/pull/848) [`0a79d75`](https://github.com/cloudflare/workers-sdk/commit/0a79d75e6aba11a3f0d5a7490f1b75c9f3e80ea8) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - polish: improve consistency of warnings and errors

  Related to #377

- [#877](https://github.com/cloudflare/workers-sdk/pull/877) [`97f945f`](https://github.com/cloudflare/workers-sdk/commit/97f945fd3544eaba3f6bc4df2e5487049ea32817) Thanks [@caass](https://github.com/caass)! - Treat the "name" parameter in `wrangler init` as a path.

  This means that running `wrangler init .` will create a worker in the current directory,
  and the worker's name will be the name of the current directory.

  You can also run `wrangler init path/to/my-worker` and a worker will be created at
  `[CWD]/path/to/my-worker` with the name `my-worker`,

* [#851](https://github.com/cloudflare/workers-sdk/pull/851) [`277b254`](https://github.com/cloudflare/workers-sdk/commit/277b25421175b4efc803cd68ef543cb55b07c114) Thanks [@threepointone](https://github.com/threepointone)! - polish: do not log the error object when refreshing a token fails

  We handle the error anyway (by doing a fresh login) which has its own logging and messaging. In the future we should add a DEBUG mode that logs all requests/errors/warnings, but that's for later.

- [#869](https://github.com/cloudflare/workers-sdk/pull/869) [`f1423bf`](https://github.com/cloudflare/workers-sdk/commit/f1423bf6399655d5c186c4849f23bb2196e4fcec) Thanks [@threepointone](https://github.com/threepointone)! - feat: experimental `--node-compat` / `config.node_compat`

  This adds an experimental node.js compatibility mode. It can be enabled by adding `node_compat = true` in `wrangler.toml`, or by passing `--node-compat` as a command line arg for `dev`/`publish` commands. This is currently powered by `@esbuild-plugins/node-globals-polyfill` (which in itself is powered by `rollup-plugin-node-polyfills`).

  We'd previously added this, and then removed it because the quality of the polyfills isn't great. We're reintroducing it regardless so we can start getting feedback on its usage, and it sets up a foundation for replacing it with our own, hopefully better maintained polyfills.

  Of particular note, this means that what we promised in https://blog.cloudflare.com/announcing-stripe-support-in-workers/ now actually works.

  This patch also addresses some dependency issues, specifically leftover entries in package-lock.json.

* [#790](https://github.com/cloudflare/workers-sdk/pull/790) [`331c659`](https://github.com/cloudflare/workers-sdk/commit/331c65979295320b37cbf1f995f4acfc28630702) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - feature: Adds 'wrangler pages publish' (alias 'wrangler pages deployment create') command.

- [#866](https://github.com/cloudflare/workers-sdk/pull/866) [`8b227fc`](https://github.com/cloudflare/workers-sdk/commit/8b227fc97e50abe36651b4a6c029b9ada404dc1f) Thanks [@caass](https://github.com/caass)! - Add a runtime check for `wrangler dev` local mode to avoid erroring in environments with no `AsyncLocalStorage` class

  Certain runtime APIs are only available to workers during the "request context",
  which is any code that returns after receiving a request and before returning
  a response.

  Miniflare emulates this behavior by using an [`AsyncLocalStorage`](https://nodejs.org/api/async_context.html#class-asynclocalstorage) and
  [checking at runtime](https://github.com/cloudflare/miniflare/blob/master/packages/shared/src/context.ts#L21-L36)
  to see if you're using those APIs during the request context.

  In certain environments `AsyncLocalStorage` is unavailable, such as in a
  [webcontainer](https://github.com/stackblitz/webcontainer-core).
  This function figures out if we're able to run those "request context" checks
  and returns [a set of options](https://miniflare.dev/core/standards#global-functionality-limits)
  that indicate to miniflare whether to run the checks or not.

* [#829](https://github.com/cloudflare/workers-sdk/pull/829) [`f08aac5`](https://github.com/cloudflare/workers-sdk/commit/f08aac5dc1894ceaa84fc8b1a0c3d898dbbbe028) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: Add validation to the `name` field in configuration.
  The validation will warn users that the field can only be "type string,
  alphanumeric, underscores, and lowercase with dashes only" using the same RegEx as the backend

  resolves #795 #775

- [#868](https://github.com/cloudflare/workers-sdk/pull/868) [`6ecb1c1`](https://github.com/cloudflare/workers-sdk/commit/6ecb1c128bde5c8f8d7403278f07cc0e991c16a0) Thanks [@threepointone](https://github.com/threepointone)! - feat: implement service environments + durable objects

  Now that the APIs for getting migrations tags of services works as expected, this lands support for publishing durable objects to service environments, including migrations. It also removes the error we used to throw when attempting to use service envs + durable objects.

  Fixes https://github.com/cloudflare/workers-sdk/issues/739

## 0.0.27

### Patch Changes

- [#838](https://github.com/cloudflare/workers-sdk/pull/838) [`9c025c4`](https://github.com/cloudflare/workers-sdk/commit/9c025c41b89e744e2d1a228baf6d24a0e7defe55) Thanks [@threepointone](https://github.com/threepointone)! - fix: remove timeout on custom builds, and make sure logs are visible

  This removes the timeout we have for custom builds. We shouldn't be applying this timeout anyway, since it doesn't block wrangler, just the user themselves. Further, in https://github.com/cloudflare/workers-sdk/pull/759, we changed the custom build's process stdout/stderr config to "pipe" to pass tests, however that meant we wouldn't see logs in the terminal anymore. This patch removes the timeout, and brings back proper logging for custom builds.

* [#349](https://github.com/cloudflare/workers-sdk/pull/349) [`9d04a68`](https://github.com/cloudflare/workers-sdk/commit/9d04a6866099e77a93a50dfd33d6e7707e4d9e9c) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: rename `--script-path` to `--outfile` for `wrangler pages functions build` command.

- [#836](https://github.com/cloudflare/workers-sdk/pull/836) [`28e3b17`](https://github.com/cloudflare/workers-sdk/commit/28e3b1756009df462b6f25c1fb1b0fa567e7ca67) Thanks [@threepointone](https://github.com/threepointone)! - fix: toggle `workers.dev` subdomains only when required

  This fix -

  - passes the correct query param to check whether a workers.dev subdomain has already been published/enabled
  - thus enabling it only when it's not been enabled
  - it also disables it only when it's explicitly knows it's already been enabled

  The effect of this is that publishes are much faster.

* [#794](https://github.com/cloudflare/workers-sdk/pull/794) [`ee3475f`](https://github.com/cloudflare/workers-sdk/commit/ee3475fc4204335f3659e9a045524e8dc9dc6b2c) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: Error messaging from failed login would dump a `JSON.parse` error in some situations. Added a fallback if `.json` fails to parse
  it will attempt `.text()` then throw result. If both attempts to parse fail it will throw an `UnknownError` with a message showing where
  it originated.

  resolves #539

- [#840](https://github.com/cloudflare/workers-sdk/pull/840) [`32f6108`](https://github.com/cloudflare/workers-sdk/commit/32f6108a6427e542d45bd14f85e2f2d4e4a79f1c) Thanks [@threepointone](https://github.com/threepointone)! - fix: make wrangler work on node v18

  There's some interference between our data fetching library `undici` and node 18's new `fetch` and co. (powered by `undici` internally) which replaces the filename of `File`s attached to `FormData`s with a generic `blob` (likely this code - https://github.com/nodejs/undici/blob/615f6170f4bd39630224c038d1ea5bf505d292af/lib/fetch/formdata.js#L246-L250). It's still not clear why it does so, and it's hard to make an isolated example of this.

  Regardless, disabling the new `fetch` functionality makes `undici` use its own base classes, avoiding the problem for now, and unblocking our release. We'll keep investigating and look for a proper fix.

  Unblocks https://github.com/cloudflare/workers-sdk/issues/834

* [#824](https://github.com/cloudflare/workers-sdk/pull/824) [`62af4b6`](https://github.com/cloudflare/workers-sdk/commit/62af4b6603f56a046e00688c94a0fe8d760891a3) Thanks [@threepointone](https://github.com/threepointone)! - feat: `publish --dry-run`

  It can be useful to do a dry run of publishing. Developers want peace of mind that a project will compile before actually publishing to live servers. Combined with `--outdir`, this is also useful for testing the output of `publish`. Further, it gives developers a chance to upload our generated sourcemap to a service like sentry etc, so that errors from the worker can be mapped against actual source code, but before the service actually goes live.

- [#798](https://github.com/cloudflare/workers-sdk/pull/798) [`feecc18`](https://github.com/cloudflare/workers-sdk/commit/feecc18b1bfec271dc595cba0c57ee6af8213af3) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Allows `next()` to take just a pathname with Pages Functions.

* [#839](https://github.com/cloudflare/workers-sdk/pull/839) [`f2d6de6`](https://github.com/cloudflare/workers-sdk/commit/f2d6de6364b42305f70c40058155a0aecab5c2a5) Thanks [@threepointone](https://github.com/threepointone)! - fix: persist dev experimental storage state in feature specific dirs

  With `--experimental-enable-local-persistence` in `dev`, we were clobbering a single folder with data from kv/do/cache. This patch gives individual folders for them. It also enables persistence even when this is not true, but that stays only for the length of a session, and cleans itself up when the dev session ends.

  Fixes https://github.com/cloudflare/workers-sdk/issues/830

- [#820](https://github.com/cloudflare/workers-sdk/pull/820) [`60c409a`](https://github.com/cloudflare/workers-sdk/commit/60c409a9478ae0ab51a40da0c7c9fa0d9a5917ca) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: display a warning if the user has a `miniflare` section in their `wrangler.toml`.

  Closes #799

* [#796](https://github.com/cloudflare/workers-sdk/pull/796) [`3e0db3b`](https://github.com/cloudflare/workers-sdk/commit/3e0db3baf6f6a3eb5b4b947e1a2fb46cbd5a7095) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Makes Response Headers object mutable after a call to `next()` in Pages Functions

- [#814](https://github.com/cloudflare/workers-sdk/pull/814) [`51fea7c`](https://github.com/cloudflare/workers-sdk/commit/51fea7c53bc17f43c8674044517bdbff6b77188f) Thanks [@threepointone](https://github.com/threepointone)! - fix: disallow setting account_id in named service environments

  Much like https://github.com/cloudflare/workers-sdk/pull/641, we don't want to allow setting account_id with named service environments. This is so that we use the same account_id for multiple environments, and have them group together in the dashboard.

* [#823](https://github.com/cloudflare/workers-sdk/pull/823) [`4a00910`](https://github.com/cloudflare/workers-sdk/commit/4a00910f2c689620566d650cb0f1709d72cc0dcd) Thanks [@threepointone](https://github.com/threepointone)! - fix: don't log an error when `wrangler dev` is cancelled early

  We currently log an `AbortError` with a stack if we exit `wrangler dev`'s startup process before it's done. This fix skips logging that error (since it's not an exception).

  Test plan:

  ```
  cd packages/wrangler
  npm run build
  cd ../../examples/workers-chat-demo
  npx wrangler dev
  # hit [x] as soon as the hotkey shortcut bar shows
  ```

- [#815](https://github.com/cloudflare/workers-sdk/pull/815) [`025c722`](https://github.com/cloudflare/workers-sdk/commit/025c722b30005c701c459327b86a63ac05e0f59b) Thanks [@threepointone](https://github.com/threepointone)! - fix: ensure that bundle is generated to es2020 target

  The default tsconfig generated by tsc uses `target: "es5"`, which we don't support. This fix ensures that we output es2020 modules, even if tsconfig asks otherwise.

* [#349](https://github.com/cloudflare/workers-sdk/pull/349) [`9d04a68`](https://github.com/cloudflare/workers-sdk/commit/9d04a6866099e77a93a50dfd33d6e7707e4d9e9c) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feature: Adds a `--plugin` option to `wrangler pages functions build` which compiles a Pages Plugin. More information about Pages Plugins can be found [here](https://developers.cloudflare.com/pages/platform/functions/plugins/). This wrangler build is required for both the development of, and inclusion of, plugins.

- [#822](https://github.com/cloudflare/workers-sdk/pull/822) [`4302172`](https://github.com/cloudflare/workers-sdk/commit/43021725380a1c914c93774ad5251580ee13d730) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Add help messages for `wrangler pages project` and `wrangler pages deployment`

* [#837](https://github.com/cloudflare/workers-sdk/pull/837) [`206b9a5`](https://github.com/cloudflare/workers-sdk/commit/206b9a5ac93eddc9b26ad18438258e1f68fbdd91) Thanks [@threepointone](https://github.com/threepointone)! - polish: replace 🦺 with ⚠️

  I got some feedback that the construction worker jacket (?) icon for deprecations is confusing, especially because it's an uncommon icon and not very big in the terminal. This patch replaces it with a more familiar warning symbol.

- [#824](https://github.com/cloudflare/workers-sdk/pull/824) [`62af4b6`](https://github.com/cloudflare/workers-sdk/commit/62af4b6603f56a046e00688c94a0fe8d760891a3) Thanks [@threepointone](https://github.com/threepointone)! - feat: `publish --outdir <path>`

  It can be useful to introspect built assets. A leading usecase is to upload the sourcemap that we generate to services like sentry etc, so that errors from the worker can be mapped against actual source code. We introduce a `--outdir` cli arg to specify a path to generate built assets at, which doesn't get cleaned up after publishing. We are _not_ adding this to `wrangler.toml` just yet, but could in the future if it looks appropriate there.

* [#811](https://github.com/cloudflare/workers-sdk/pull/811) [`8c2c7b7`](https://github.com/cloudflare/workers-sdk/commit/8c2c7b738cb7519c3b0e10d1c2a138db74342c7a) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: Added `minify` as a configuration option and a cli arg, which will minify code for `dev` and `publish`

  resolves #785

## 0.0.26

### Patch Changes

- [#782](https://github.com/cloudflare/workers-sdk/pull/782) [`34552d9`](https://github.com/cloudflare/workers-sdk/commit/34552d94fb41b7e119fd39bd26fb77568866ecaa) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feature: Add 'pages create project [name]' command.

  This command will create a Pages project with a given name, and optionally set its `--production-branch=[production]`.

* [#772](https://github.com/cloudflare/workers-sdk/pull/772) [`a852e32`](https://github.com/cloudflare/workers-sdk/commit/a852e329d9f3df1da24ed9a5b617ff9cae2ebcde) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: We want to prevent any user created code from sending Events to Sentry,
  which can be captured by `uncaughtExceptionMonitor` listener.
  Miniflare code can run user code on the same process as Wrangler,
  so we want to return `null` if `@miniflare` is present in the Event frames.

- [#778](https://github.com/cloudflare/workers-sdk/pull/778) [`85b0c31`](https://github.com/cloudflare/workers-sdk/commit/85b0c31a852985e353e455d116358693509c6cd5) Thanks [@threepointone](https://github.com/threepointone)! - feat: optionally send zone_id with a route

  This enables optionally passing a route as `{pattern: string, zone_id: string}`. There are scenarios where we need to explicitly pass a zone_id to the api, so this enables that.

  Some nuance: The errors from the api aren't super useful when invalid values are passed, but that's something to further work on.

  This also fixes some types in our cli parsing.

  Fixes https://github.com/cloudflare/workers-sdk/issues/774

* [#797](https://github.com/cloudflare/workers-sdk/pull/797) [`67fc4fc`](https://github.com/cloudflare/workers-sdk/commit/67fc4fc68741df9054eb795ac93ef223866ffbe9) Thanks [@threepointone](https://github.com/threepointone)! - feat: optionally send `zone_name` with routes

  A followup to https://github.com/cloudflare/workers-sdk/pull/778, this lets you send an optional `zone_name` with routes. This is particularly useful when using ssl for saas (https://developers.cloudflare.com/ssl/ssl-for-saas/).

  Fixes https://github.com/cloudflare/workers-sdk/issues/793

- [#813](https://github.com/cloudflare/workers-sdk/pull/813) [`5c59f97`](https://github.com/cloudflare/workers-sdk/commit/5c59f97bbd79db61992f48ac6b9ae6483a27b0d7) Thanks [@threepointone](https://github.com/threepointone)! - add a warning if service environments are being used.

  Service environments are not ready for widespread usage, and their behaviour is going to change. This adds a warning if anyone uses them.

  Closes https://github.com/cloudflare/workers-sdk/issues/809

* [#789](https://github.com/cloudflare/workers-sdk/pull/789) [`5852bba`](https://github.com/cloudflare/workers-sdk/commit/5852bbaf5d0b6f58a7e911818031d1c27a8df206) Thanks [@threepointone](https://github.com/threepointone)! - polish: don't log all errors when logging in

  This removes a couple of logs we had for literally every error in our oauth flow. We throw the error and handle it separately anyway, so this is a safe cleanup.

  Fixes https://github.com/cloudflare/workers-sdk/issues/788

- [#806](https://github.com/cloudflare/workers-sdk/pull/806) [`b24aeb5`](https://github.com/cloudflare/workers-sdk/commit/b24aeb5722370c2e04bce97a84a1fa1e55725d79) Thanks [@threepointone](https://github.com/threepointone)! - fix: check for updates on the right channel

  This makes the update checker run on the channel that the version being used runs on.

* [#807](https://github.com/cloudflare/workers-sdk/pull/807) [`7e560e1`](https://github.com/cloudflare/workers-sdk/commit/7e560e1ad967e32e68aa4e89701620b1327d8bd1) Thanks [@threepointone](https://github.com/threepointone)! - fix: read `isLegacyEnv` correctly

  This fixes the signature for `isLegacyEnv()` since it doesn't use args, and we fix reading legacy_env correctly when creating a draft worker when creating a secret.

- [#779](https://github.com/cloudflare/workers-sdk/pull/779) [`664803e`](https://github.com/cloudflare/workers-sdk/commit/664803e6636785103336333999c2ae784b60463f) Thanks [@threepointone](https://github.com/threepointone)! - chore: update packages

  This updates some dependencies. Some highlights -

  - updates to `@iarna/toml` means we can have mixed types for inline arrays, which is great for #774 / https://github.com/cloudflare/workers-sdk/pull/778
  - I also moved timeago.js to `devDependencies` since it already gets compiled into the bundle
  - updates to `esbuild` brings along a number of smaller fixes for modern js

* [#810](https://github.com/cloudflare/workers-sdk/pull/810) [`0ce47a5`](https://github.com/cloudflare/workers-sdk/commit/0ce47a587a029db9caa6e402ba3e7228ebb31c4c) Thanks [@caass](https://github.com/caass)! - Make `wrangler tail` TTY-aware, and stop printing non-JSON in JSON mode

  Closes #493

  2 quick fixes:

  - Check `process.stdout.isTTY` at runtime to determine whether to default to "pretty" or "json" output for tailing.
  - Only print messages like "Connected to {worker}" if in "pretty" mode (errors still throw strings)

## 0.0.25

### Patch Changes

- [#752](https://github.com/cloudflare/workers-sdk/pull/752) [`6d43e94`](https://github.com/cloudflare/workers-sdk/commit/6d43e94fb8a739b918bcd808683651f78180dfd8) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add a warning if `dev` is defaulting to the latest compatibility-date

  Fixes https://github.com/cloudflare/workers-sdk/issues/741

* [#767](https://github.com/cloudflare/workers-sdk/pull/767) [`836ad59`](https://github.com/cloudflare/workers-sdk/commit/836ad5910f2c3b5d6169f8f0f0e522710158f658) Thanks [@threepointone](https://github.com/threepointone)! - fix: use cwd for `--experiment-enable-local-persistence`

  This sets up `--experiment-enable-local-persistence` to explicitly use `process.cwd() + wrangler-local-state` as a path to store values. Without it, local mode uses the temp dir that we use to bundle the worker, which gets wiped out on ending wrangler dev. In the future, based on usage, we may want to make the path configurable as well.

  Fixes https://github.com/cloudflare/workers-sdk/issues/766

- [#723](https://github.com/cloudflare/workers-sdk/pull/723) [`7942936`](https://github.com/cloudflare/workers-sdk/commit/79429367f451d53a74413fd942053c3f732fe998) Thanks [@threepointone](https://github.com/threepointone)! - fix: spread tail messages when logging

  Logged messages (via console, etc) would previously be logged as an array of values. This spreads it when logging to match what is expected.

* [#756](https://github.com/cloudflare/workers-sdk/pull/756) [`8e38442`](https://github.com/cloudflare/workers-sdk/commit/8e384427a384fd32e7b1552e6edd898e8d4361a1) Thanks [@threepointone](https://github.com/threepointone)! - fix: resolve raw file bindings correctly in `wrangler dev` local mode

  For `wasm_modules`/`text_blobs`/`data_blobs` in local mode, we need to rewrite the paths as absolute so that they're resolved correctly by miniflare. This also expands some coverage for local mode `wrangler dev`.

  Fixes https://github.com/cloudflare/workers-sdk/issues/740
  Fixes https://github.com/cloudflare/workers-sdk/issues/416

- [#699](https://github.com/cloudflare/workers-sdk/pull/699) [`ea8e701`](https://github.com/cloudflare/workers-sdk/commit/ea8e7015776b7ac1e15cd14d436d57403a8c5127) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - polish: added logout and login to helpstring message.

* [#728](https://github.com/cloudflare/workers-sdk/pull/728) [`0873049`](https://github.com/cloudflare/workers-sdk/commit/087304941d69b7bbabb40cfabcb553c631f1a23d) Thanks [@threepointone](https://github.com/threepointone)! - fix: only send durable object migrations when required

  We had a bug where even if you'd published a script with migrations, we would still send a blank set of migrations on the next round. The api doesn't accept this, so the fix is to not do so. I also expanded test coverage for migrations.

  Fixes https://github.com/cloudflare/workers-sdk/issues/705

- [#750](https://github.com/cloudflare/workers-sdk/pull/750) [`b933641`](https://github.com/cloudflare/workers-sdk/commit/b9336414c3c1ac20ba34d274042886ea802385d9) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to [`2.4.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.4.0)

* [#763](https://github.com/cloudflare/workers-sdk/pull/763) [`f72c943`](https://github.com/cloudflare/workers-sdk/commit/f72c943e6f320fc1af93a9aab21fd93371d941df) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: Added the update check that will check the package once a day against the beta release, `distTag` can be changed later, then prints the latestbeta version to the user.

  resolves #762

- [#695](https://github.com/cloudflare/workers-sdk/pull/695) [`48fa89b`](https://github.com/cloudflare/workers-sdk/commit/48fa89b86d5b76b43cfd25035e914c32778eb80e) Thanks [@caass](https://github.com/caass)! - fix: stop wrangler spamming console after login

  If a user hasn't logged in and then they run a command that needs a login they'll get bounced to the login flow.
  The login flow (if completed) would write their shiny new OAuth2 credentials to disk, but wouldn't reload the
  in-memory state. This led to issues like #693, where even though the user was logged in on-disk, wrangler
  wouldn't be aware of it.

  We now update the in-memory login state each time new credentials are written to disk.

* [#734](https://github.com/cloudflare/workers-sdk/pull/734) [`a1dadac`](https://github.com/cloudflare/workers-sdk/commit/a1dadacbc2a994fb6cddd1cf8613a0dc3c69a49d) Thanks [@threepointone](https://github.com/threepointone)! - fix: exit dev if build fails on first run

  Because of https://github.com/evanw/esbuild/issues/1037, we can't recover dev if esbuild fails on first run. The workaround is to end the process if it does so, until we have a better fix.

  Reported in https://github.com/cloudflare/workers-sdk/issues/731

- [#757](https://github.com/cloudflare/workers-sdk/pull/757) [`13e57cd`](https://github.com/cloudflare/workers-sdk/commit/13e57cdca626cf0f38640c4aab1aa1ee1969312b) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - feature: Add wrangler pages project list

  Adds a new command to list your projects in Cloudflare Pages.

* [#745](https://github.com/cloudflare/workers-sdk/pull/745) [`6bc3e85`](https://github.com/cloudflare/workers-sdk/commit/6bc3e859346dda825eb58fd684260840f70a6259) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add hotkey to clear the console in `wrangler dev`

  Closes #388

- [#747](https://github.com/cloudflare/workers-sdk/pull/747) [`db6b830`](https://github.com/cloudflare/workers-sdk/commit/db6b830f217ce0ff7e12bbaee851688ee39d8734) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: remove `process.exit()` from the pages code

  This enables simpler testing, as we do not have to spawn new child processes
  to avoid the `process.exit()` from killing the jest process.

  As part of the refactor, some of the `Error` classes have been moved to a
  shared `errors.ts` file.

* [#726](https://github.com/cloudflare/workers-sdk/pull/726) [`c4e5dc3`](https://github.com/cloudflare/workers-sdk/commit/c4e5dc332e8a31ea7e6d74861597d17b446eb68f) Thanks [@threepointone](https://github.com/threepointone)! - fix: assume a worker is a module worker only if it has a `default` export

  This tweaks the logic that guesses worker formats to check whether a `default` export is defined on an entry point before assuming it's a module worker.

- [#735](https://github.com/cloudflare/workers-sdk/pull/735) [`c38ae3d`](https://github.com/cloudflare/workers-sdk/commit/c38ae3dd36464522e13f32813123fd7b4deb6be3) Thanks [@threepointone](https://github.com/threepointone)! - `text_blobs`/Text module support for service worker format in local mode

  This adds support for `text_blobs`/Text module support in local mode. Now that https://github.com/cloudflare/miniflare/pull/228 has landed in miniflare (thanks @caass!), we can use that in wrangler as well.

* [#743](https://github.com/cloudflare/workers-sdk/pull/743) [`ac5c48b`](https://github.com/cloudflare/workers-sdk/commit/ac5c48b90f05b5464bb6bd3affdad3beba0c26a2) Thanks [@threepointone](https://github.com/threepointone)! - feat: implement `[data_blobs]`

  This implements `[data_blobs]` support for service-worker workers, as well as enabling Data module support for service-worker workers. `data_blob` is a supported binding type, but we never implemented support for it in v1. This implements support, and utilises it for supporting Data modules in service worker format. Implementation wise, it's incredibly similar to how we implemented `text_blobs`, with relevant changes.

  Partial fix for https://github.com/cloudflare/workers-sdk/issues/740 pending local mode support.

- [#753](https://github.com/cloudflare/workers-sdk/pull/753) [`cf432ac`](https://github.com/cloudflare/workers-sdk/commit/cf432ac0150a205bd6a32f996d15a75515d269d6) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: distinguish the command hotkeys in wrangler dev

  Closes #354

* [#746](https://github.com/cloudflare/workers-sdk/pull/746) [`3e25dcb`](https://github.com/cloudflare/workers-sdk/commit/3e25dcb377b29181ae0bf2210180f1b17c34f971) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: remove superfluous debugger log messages from local dev

  Closes #387

- [#758](https://github.com/cloudflare/workers-sdk/pull/758) [`9bd95ce`](https://github.com/cloudflare/workers-sdk/commit/9bd95cea7399bd3240a3fdb017c3abb33602f807) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - feature: Add wrangler pages deployment list

  Renders a list of deployments in a Cloudflare Pages project

* [#733](https://github.com/cloudflare/workers-sdk/pull/733) [`91873e4`](https://github.com/cloudflare/workers-sdk/commit/91873e422f0aaed5596b98f626484ccadc400c67) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - polish: improved visualization of the deprecation messages between serious and warnings with emojis. This also improves the delineation between messages.

- [#738](https://github.com/cloudflare/workers-sdk/pull/738) [`c04791c`](https://github.com/cloudflare/workers-sdk/commit/c04791c0214601d6b1e767484c961a343f6c034a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add support for cron triggers in `dev --local` mode

  Currently, I don't know if there is support for doing this in "remote" dev mode.

  Resolves #737

* [#732](https://github.com/cloudflare/workers-sdk/pull/732) [`c63ea3d`](https://github.com/cloudflare/workers-sdk/commit/c63ea3deb98bf862e8f87a366c4ea654ec503092) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: abort async operations in the `Remote` component to avoid unwanted side-effects
  When the `Remote` component is unmounted, we now signal outstanding `fetch()` requests, and
  `waitForPortToBeAvailable()` tasks to cancel them. This prevents unexpected requests from appearing
  after the component has been unmounted, and also allows the process to exit cleanly without a delay.

  fixes #375

## 0.0.24

### Patch Changes

- [#719](https://github.com/cloudflare/workers-sdk/pull/719) [`6503ace`](https://github.com/cloudflare/workers-sdk/commit/6503ace108d1bd81d908fc8dcd0c3506903e4c63) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure the correct worker name is published in legacy environments

  When a developer uses `--env` to specify an environment name, the Worker name should
  be computed from the top-level Worker name and the environment name.

  When the given environment name does not match those in the wrangler.toml, we error.
  But if no environments have been specified in the wrangler.toml, at all, then we only
  log a warning and continue.

  In this second case, we were reusing the top-level environment, which did not have the
  correct legacy environment fields set, such as the name. Now we ensure that such an
  environment is created as needed.

  See https://github.com/cloudflare/workers-sdk/pull/680#issuecomment-1080407556

* [#708](https://github.com/cloudflare/workers-sdk/pull/708) [`763dcb6`](https://github.com/cloudflare/workers-sdk/commit/763dcb650c2b7b8f2a0169ff5592a88375cb9974) Thanks [@threepointone](https://github.com/threepointone)! - fix: unexpected commands and arguments should throw

  This enables strict mode in our command line parser (yargs), so that unexpected commands and options uniformly throw errors.

  Fixes https://github.com/cloudflare/workers-sdk/issues/706

- [#713](https://github.com/cloudflare/workers-sdk/pull/713) [`18d09c7`](https://github.com/cloudflare/workers-sdk/commit/18d09c7f8d70fa7288fbf8455d6e0c15125a6b78) Thanks [@threepointone](https://github.com/threepointone)! - fix: don't fetch zone id for `wrangler dev --local`

  We shouldn't try to resolve a domain/route to a zone id when starting in local mode (since there may not even be network).

* [#692](https://github.com/cloudflare/workers-sdk/pull/692) [`52ea60f`](https://github.com/cloudflare/workers-sdk/commit/52ea60f2c0e082e7db5926cca74d79f48afbdf3b) Thanks [@threepointone](https://github.com/threepointone)! - fix: do not deploy to workers.dev when routes are defined in an environment

  When `workers_dev` is not configured, we had a bug where it would default to true inside an environment even when there were routes defined, thus publishing both to a `workers.dev` subdomain as well as the defined routes. The fix is to default `workers_dev` to `undefined`, and check when publishing whether or not to publish to `workers.dev`/defined routes.

  Fixes https://github.com/cloudflare/workers-sdk/issues/690

- [#687](https://github.com/cloudflare/workers-sdk/pull/687) [`8f7ac7b`](https://github.com/cloudflare/workers-sdk/commit/8f7ac7b3f009f2ce63bd880f7d73c2b675a2e8d7) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add warning about `wrangler dev` with remote Durable Objects

  Durable Objects that are being bound by `script_name` will not be isolated from the
  live data during development with `wrangler dev`.
  This change simply warns the developer about this, so that they can back out before
  accidentally changing live data.

  Fixes #319

* [#661](https://github.com/cloudflare/workers-sdk/pull/661) [`6967086`](https://github.com/cloudflare/workers-sdk/commit/696708692c88b0f4a25d954d675bece57043fa19) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - polish: add "Beta" messaging around the CLI command for Pages. Explicitly specifying the command is Beta, not to be confused with Pages itself which is production ready.

- [#709](https://github.com/cloudflare/workers-sdk/pull/709) [`7e8ec9a`](https://github.com/cloudflare/workers-sdk/commit/7e8ec9a0807deacd58cd25f5a8fd7d21b2fdb535) Thanks [@threepointone](https://github.com/threepointone)! - fix: trigger login flow if refreshtoken isn't valid

  If the auth refresh token isn't valid, then we should trigger the login flow. Reported in https://github.com/cloudflare/workers-sdk/issues/316

* [#702](https://github.com/cloudflare/workers-sdk/pull/702) [`241000f`](https://github.com/cloudflare/workers-sdk/commit/241000f3741eaed20a0bdfdb734aae0c7cabbd6e) Thanks [@threepointone](https://github.com/threepointone)! - fix: setup jsx loaders when guessing worker format

  - We consider jsx to be regular js, and have setup our esbuild process to process js/mjs/cjs files as jsx.
  - We use a separate esbuild run on an entry point file when trying to guess the worker format, but hadn't setup the loaders there.
  - So if just the entrypoint file has any jsx in it, then we error because it can't parse the code.

  The fix is to add the same loaders to the esbuild run that guesses the worker format.

  Reported in https://github.com/cloudflare/workers-sdk/issues/701

- [#711](https://github.com/cloudflare/workers-sdk/pull/711) [`3dac1da`](https://github.com/cloudflare/workers-sdk/commit/3dac1daaea56219d199c19f49c7616df539533aa) Thanks [@threepointone](https://github.com/threepointone)! - fix: default `wrangler tail` to pretty print

  Fixes https://github.com/cloudflare/workers-sdk/issues/707

* [#712](https://github.com/cloudflare/workers-sdk/pull/712) [`fb53fda`](https://github.com/cloudflare/workers-sdk/commit/fb53fda3cbfca6cfa86147a151d882f3232b1439) Thanks [@threepointone](https://github.com/threepointone)! - feat: Non-interactive mode

  Continuing the work from https://github.com/cloudflare/workers-sdk/pull/325, this detects when wrangler is running inside an environment where "raw" mode is not available on stdin, and disables the features for hot keys and the shortcut bar. This also adds stubs for testing local mode functionality in `local-mode-tests`, and deletes the previous hacky `dev2.test.tsx`.

  Fixes https://github.com/cloudflare/workers-sdk/issues/322

- [#716](https://github.com/cloudflare/workers-sdk/pull/716) [`6987cf3`](https://github.com/cloudflare/workers-sdk/commit/6987cf3964fa53d31771fad631aa78cb5a8cad3b) Thanks [@threepointone](https://github.com/threepointone)! - feat: path to a custom `tsconfig`

  This adds a config field and a command line arg `tsconfig` for passing a path to a custom typescript configuration file. We don't do any typechecking, but we do pass it along to our build process so things like `compilerOptions.paths` get resolved correctly.

* [#665](https://github.com/cloudflare/workers-sdk/pull/665) [`62a89c6`](https://github.com/cloudflare/workers-sdk/commit/62a89c67f5dacf36e05c7d462410bf0d31844052) Thanks [@caass](https://github.com/caass)! - fix: validate that bindings have unique names

  We don't want to have, for example, a KV namespace named "DATA"
  and a Durable Object also named "DATA". Then it would be ambiguous
  what exactly would live at `env.DATA` (or in the case of service workers,
  the `DATA` global) which could lead to unexpected behavior -- and errors.

  Similarly, we don't want to have multiple resources of the same type
  bound to the same name. If you've been working with some KV namespace
  called "DATA", and you add a second namespace but don't change the binding
  to something else (maybe you're copying-and-pasting and just changed out the `id`),
  you could be reading entirely the wrong stuff out of your KV store.

  So now we check for those sorts of situations and throw an error if
  we find that we've encountered one.

- [#698](https://github.com/cloudflare/workers-sdk/pull/698) [`e3e3243`](https://github.com/cloudflare/workers-sdk/commit/e3e3243bf2c9fd1284dae1eff30ccd756edff4e5) Thanks [@threepointone](https://github.com/threepointone)! - feat: inject `process.env.NODE_ENV` into scripts

  An extremely common pattern in the js ecosystem is to add additional behaviour gated by the value of `process.env.NODE_ENV`. For example, React leverages it heavily to add dev-time checks and warnings/errors, and to load dev/production versions of code. By doing this substitution ourselves, we can get a significant runtime boost in libraries/code that leverage this.

  This does NOT tackle the additional features of either minification, or proper node compatibility, or injecting wrangler's own environment name, which we will tackle in future PRs.

* [#680](https://github.com/cloudflare/workers-sdk/pull/680) [`8e2cbaf`](https://github.com/cloudflare/workers-sdk/commit/8e2cbaf718cfad279947f99107a0485f07b0f3b0) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - refactor: support backwards compatibility with environment names and related CLI flags

  1. When in Legacy environment mode we should not compute name field if specified in an environment.
  2. Throw an Error when `--env` and `--name` are used together in Legacy Environment, except for Secrets & Tail which are using a special case `getLegacyScriptName` for parity with Wrangler v1
  3. Started the refactor for args being utilized at the Config level, currently checking for Legacy Environment only.

  Fixes https://github.com/cloudflare/workers-sdk/issues/672

- [#684](https://github.com/cloudflare/workers-sdk/pull/684) [`82ec7c2`](https://github.com/cloudflare/workers-sdk/commit/82ec7c2c65b1515cf081420499091cd0878fed8d) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Fix `--binding` option for `wrangler pages dev`.

  We'd broken this with #581. This reverts that PR, and fixes it slightly differently. Also added an integration test to ensure we don't regress in the future.

* [#678](https://github.com/cloudflare/workers-sdk/pull/678) [`82e4143`](https://github.com/cloudflare/workers-sdk/commit/82e4143fe5ca6973b15111fd7f142a064a95ea93) Thanks [@threepointone](https://github.com/threepointone)! - fix: cleanup after `pages dev` tests

  We weren't killing the process started by wrangler whenever its parent was killed. This fix is to listen on SIGINT/SIGTERM and kill that process. I also did some minor configuration cleanups.

  Fixes https://github.com/cloudflare/workers-sdk/issues/397
  Fixes https://github.com/cloudflare/workers-sdk/issues/618

## 0.0.23

### Patch Changes

- [#675](https://github.com/cloudflare/workers-sdk/pull/675) [`e88a54e`](https://github.com/cloudflare/workers-sdk/commit/e88a54ed41ec9e5de707d35115f5bc7395b0d28f) Thanks [@threepointone](https://github.com/threepointone)! - fix: resolve non-js modules correctly in local mode

  In https://github.com/cloudflare/workers-sdk/pull/633, we missed passing a cwd to the process that runs the miniflare cli. This broke how miniflare resolves modules, and led back to the dreaded "path should be a `path.relative()`d string" error. The fix is to simply pass the cwd to the `spawn` call.

  Test plan:

  ```
  cd packages/wrangler
  npm run build
  cd ../workers-chat-demo
  npx wrangler dev --local
  ```

* [#668](https://github.com/cloudflare/workers-sdk/pull/668) [`3dcdb0d`](https://github.com/cloudflare/workers-sdk/commit/3dcdb0d7dfdfd842228987e8b095ca5526d7404d) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: tighten up the named environment configuration

  Now, when we normalize and validate the raw config, we pass in the currently
  active environment name, and the config that is returned contains all the
  environment fields correctly normalized (including inheritance) at the top
  level of the config object. This avoids other commands from having to check
  both the current named environment and the top-level config for such fields.

  Also, now, handle the case where the active environment name passed in via the
  `--env` command line argument does not match any of the named environments
  in the configuration:

  - This is an error if there are named environments configured;
  - or only a warning if there are no named environments configured.

- [#633](https://github.com/cloudflare/workers-sdk/pull/633) [`003f3c4`](https://github.com/cloudflare/workers-sdk/commit/003f3c41942ec8e299ae603fe74b3cd2e802b49d) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - refactor: create a custom CLI wrapper around Miniflare API

  This allows us to tightly control the options that are passed to Miniflare.
  The current CLI is setup to be more compatible with how Wrangler v1 works, which is not optimal for Wrangler v2.

* [#633](https://github.com/cloudflare/workers-sdk/pull/633) [`84c857e`](https://github.com/cloudflare/workers-sdk/commit/84c857eabc2c09ad1dd2f4fa3963638b8b7f3daa) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: ensure asset keys are relative to the project root

  Previously, asset file paths were computed relative to the current working
  directory, even if we had used `-c` to run Wrangler on a project in a different
  directory to the current one.

  Now, assets file paths are computed relative to the "project root", which is
  either the directory containing the wrangler.toml or the current working directory
  if there is no config specified.

- [#673](https://github.com/cloudflare/workers-sdk/pull/673) [`456e1da`](https://github.com/cloudflare/workers-sdk/commit/456e1da5347afb103ba0827ba632a0b6aa81de6f) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: allow the `build` field to be inherited/overridden in a named environment"

  Now the `build` field can be specified within a named environment, overriding whatever
  may appear at the top level.

  Resolves https://github.com/cloudflare/workers-sdk/issues/588

* [#650](https://github.com/cloudflare/workers-sdk/pull/650) [`d3d1ff8`](https://github.com/cloudflare/workers-sdk/commit/d3d1ff8721dd834ce5e58b652cccd7806cba1711) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: make `main` an inheritable environment field

  See [#588](https://github.com/cloudflare/workers-sdk/issues/588)

- [#650](https://github.com/cloudflare/workers-sdk/pull/650) [`f0eed7f`](https://github.com/cloudflare/workers-sdk/commit/f0eed7fe0cc5f6166b4c2b34d193e260b881e4de) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: make validation error messages more consistent

* [#662](https://github.com/cloudflare/workers-sdk/pull/662) [`612952b`](https://github.com/cloudflare/workers-sdk/commit/612952ba11b198277be14c70d1c4090338c876bc) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - bugfix: use alias `-e` for `--env` to prevent scripts using Wrangler 1 from breaking when switching to Wrangler v2.

- [#671](https://github.com/cloudflare/workers-sdk/pull/671) [`ef0aaad`](https://github.com/cloudflare/workers-sdk/commit/ef0aaadad180face06e13fb1de079eb040badaf2) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: don't exit on initial Pages Functions compilation failure

  Previously, we'd exit the `wrangler pages dev` process if we couldn't immediately compile a Worker from the `functions` directory. We now log the error, but don't exit the process. This means that proxy processes can be cleaned up cleanly on SIGINT and SIGTERM, and it matches the behavior of if a compilation error is introduced once already running (we don't exit then either).

* [#667](https://github.com/cloudflare/workers-sdk/pull/667) [`e29a241`](https://github.com/cloudflare/workers-sdk/commit/e29a24168da2e87259b90d1a4dd0d3860bb3ba8e) Thanks [@threepointone](https://github.com/threepointone)! - fix: delete unused `[site]` assets

  We discovered critical issues with the way we expire unused assets with `[site]` (see https://github.com/cloudflare/workers-sdk/issues/666, https://github.com/cloudflare/wrangler-legacy/issues/2224), that we're going back to the legacy manner of handling unused assets, i.e- deleting unused assets.

  Fixes https://github.com/cloudflare/workers-sdk/issues/666

- [#640](https://github.com/cloudflare/workers-sdk/pull/640) [`2a2d50c`](https://github.com/cloudflare/workers-sdk/commit/2a2d50c921ffcf8f9b8719dd029206f9479ebdd8) Thanks [@caass](https://github.com/caass)! - Error if the user is trying to implement DO's in a service worker

  Durable Objects can only be implemented in Module Workers, so we should throw if we detect that
  the user is trying to implement a Durable Object but their worker is in Service Worker format.

## 0.0.22

### Patch Changes

- [#656](https://github.com/cloudflare/workers-sdk/pull/656) [`aeb0fe0`](https://github.com/cloudflare/workers-sdk/commit/aeb0fe02dbc9b8ef2edc0e2a669315bd40bbdfb3) Thanks [@threepointone](https://github.com/threepointone)! - fix: resolve npm modules correctly

  When implementing legacy module specifiers, we didn't throughly test the interaction when there weren't any other files next to the entry worker, and importing npm modules. It would create a Regex that matched _every_ import, and fail because a file of that name wasn't present in the source directory. This fix constructs a better regex, applies it only when there are more files next to the worker, and increases test coverage for that scenario.

  Fixes https://github.com/cloudflare/workers-sdk/issues/655

## 0.0.21

### Patch Changes

- [#647](https://github.com/cloudflare/workers-sdk/pull/647) [`f3f3907`](https://github.com/cloudflare/workers-sdk/commit/f3f3907963e87de17cad9a3733be716e201a8996) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add support for `--ip` and `config.dev.ip` in the dev command

  Note that this change modifies the default listening address to `localhost`, which is different to `127.0.0.1`, which is what Wrangler v1 does.
  For most developers this will make no observable difference, since the default host mapping in most OSes from `localhost` to `127.0.0.1`.

  Resolves [#584](https://github.com/cloudflare/workers-sdk/issues/584)

## 0.0.20

### Patch Changes

- [#627](https://github.com/cloudflare/workers-sdk/pull/627) [`ff53f4e`](https://github.com/cloudflare/workers-sdk/commit/ff53f4e88a062936c4ae9a390307583017dbbb29) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: do not warn about miniflare in the configuration

* [#649](https://github.com/cloudflare/workers-sdk/pull/649) [`e0b9366`](https://github.com/cloudflare/workers-sdk/commit/e0b93661a7160e718b4fc0c58fa90149968d4317) Thanks [@threepointone](https://github.com/threepointone)! - fix: use `expiration_ttl` to expire assets with `[site]`

  This switches how we expire static assets with `[site]` uploads to use `expiration_ttl` instead of `expiration`. This is because we can't trust the time that a deploy target may provide (like in https://github.com/cloudflare/wrangler-legacy/issues/2224).

- [#599](https://github.com/cloudflare/workers-sdk/pull/599) [`7d4ea43`](https://github.com/cloudflare/workers-sdk/commit/7d4ea4342947128eb156a58da69dd008d504103b) Thanks [@caass](https://github.com/caass)! - Force-open a chromium-based browser for devtools

  We rely on Chromium-based devtools for debugging workers, so when opening up the devtools URL,
  we should force a chromium-based browser to launch. For now, this means checking (in order)
  for Chrome and Edge, and then failing if neither of those are available.

* [#567](https://github.com/cloudflare/workers-sdk/pull/567) [`05b81c5`](https://github.com/cloudflare/workers-sdk/commit/05b81c5809b9ceed10d0c21c0f5f5de76b23a67d) Thanks [@threepointone](https://github.com/threepointone)! - fix: consolidate `getEntry()` logic

  This consolidates some logic into `getEntry()`, namely including `guessWorkerFormat()` and custom builds. This simplifies the code for both `dev` and `publish`.

  - Previously, the implementation of custom builds inside `dev` assumed it could be a long running process; however it's not (else consider that `publish` would never work).
  - By running custom builds inside `getEntry()`, we can be certain that the entry point exists as we validate it and before we enter `dev`/`publish`, simplifying their internals
  - We don't have to do periodic checks inside `wrangler dev` because it's now a one shot build (and always should have been)
  - This expands test coverage a little for both `dev` and `publish`.
  - The 'format' of a worker is intrinsic to its contents, so it makes sense to establish its value inside `getEntry()`
  - This also means less async logic inside `<Dev/>`, which is always a good thing

- [#628](https://github.com/cloudflare/workers-sdk/pull/628) [`b640ab5`](https://github.com/cloudflare/workers-sdk/commit/b640ab514a9a62ffd3ee63438354ea167e80c873) Thanks [@caass](https://github.com/caass)! - Validate that if `route` exists in wrangler.toml, `routes` does not (and vice versa)

* [#591](https://github.com/cloudflare/workers-sdk/pull/591) [`42c2c0f`](https://github.com/cloudflare/workers-sdk/commit/42c2c0fda6820dc7b8c0005857459d55ec82d266) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add warning about setting upstream-protocol to `http`

  We have not implemented setting upstream-protocol to `http` and currently do not intend to.

  This change just adds a warning if a developer tries to do so and provides a link to an issue where they can add their use-case.

- [#596](https://github.com/cloudflare/workers-sdk/pull/596) [`187264d`](https://github.com/cloudflare/workers-sdk/commit/187264d4013842df4062a1e0f5dd8cef0b30d0a8) Thanks [@threepointone](https://github.com/threepointone)! - feat: support Wrangler v1.x module specifiers with a deprecation warning

  This implements Wrangler v1.x style module specifiers, but also logs a deprecation warning for every usage.

  Consider a project like so:

  ```
    project
    ├── index.js
    └── some-dependency.js
  ```

  where the content of `index.js` is:

  ```jsx
  import SomeDependency from "some-dependency.js";

  addEventListener("fetch", (event) => {});
  ```

  `wrangler` 1.x would resolve `import SomeDependency from "some-dependency.js";` to the file `some-dependency.js`. This will work in `wrangler` v2, but it will log a deprecation warning. Instead, you should rewrite the import to specify that it's a relative path, like so:

  ```diff
  - import SomeDependency from "some-dependency.js";
  + import SomeDependency from "./some-dependency.js";
  ```

  In a near future version, this will become a breaking deprecation and throw an error.

  (This also updates `workers-chat-demo` to use the older style specifier, since that's how it currently is at https://github.com/cloudflare/workers-chat-demo)

  Known issue: This might not work as expected with `.js`/`.cjs`/`.mjs` files as expected, but that's something to be fixed overall with the module system.

  Closes https://github.com/cloudflare/workers-sdk/issues/586

* [#579](https://github.com/cloudflare/workers-sdk/pull/579) [`2f0e59b`](https://github.com/cloudflare/workers-sdk/commit/2f0e59bed76676f088403c7f0ceb9046668c547d) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: Incomplete subcommands render a help message for that specific subcommand.

- [#559](https://github.com/cloudflare/workers-sdk/pull/559) [`16fb5e6`](https://github.com/cloudflare/workers-sdk/commit/16fb5e686024aba614d805a4edb49fb53a8e32db) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: support adding secrets in non-interactive mode

  Now the user can pipe in the secret value to the `wrangler secret put` command.
  For example:

  ```
  cat my-secret.txt | wrangler secret put secret-key --name worker-name
  ```

  This requires that the user is logged in, and has only one account, or that the `account_id` has been set in `wrangler.toml`.

  Fixes #170

* [#597](https://github.com/cloudflare/workers-sdk/pull/597) [`94c2698`](https://github.com/cloudflare/workers-sdk/commit/94c2698cd6d62ec7cb69530697f2eac2bf068163) Thanks [@caass](https://github.com/caass)! - Deprecate `wrangler route`, `wrangler route list`, and `wrangler route delete`

  Users should instead modify their wrangler.toml or use the `--routes` flag when publishing
  to manage routes.

- [#564](https://github.com/cloudflare/workers-sdk/pull/564) [`ffd5c0d`](https://github.com/cloudflare/workers-sdk/commit/ffd5c0d1b93871e751371bf45498bfc468fa5b84) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Request Pages OAuth scopes when logging in

* [#638](https://github.com/cloudflare/workers-sdk/pull/638) [`06f9278`](https://github.com/cloudflare/workers-sdk/commit/06f9278d69dfe137ed9837e29bbf48bbd364e8c1) Thanks [@threepointone](https://github.com/threepointone)! - polish: add a small banner for commands

  This adds a small banner for most commands. Specifically, we avoid any commands that maybe used as a parse input (like json into jq). The banner itself simply says "⛅️ wrangler" with an orange underline.

- [#561](https://github.com/cloudflare/workers-sdk/pull/561) [`6e9a219`](https://github.com/cloudflare/workers-sdk/commit/6e9a219f53b7d13bee94c8468846553df48c72c3) Thanks [@threepointone](https://github.com/threepointone)! - fix: resolve modules correctly in `wrangler dev --local`

  This is an alternate fix to https://github.com/cloudflare/miniflare/pull/205, and fixes the error where miniflare would get confused resolving relative modules on macs because of `/var`/`/private/var` being symlinks. Instead, we `realpathSync` the bundle path before passing it on to miniflare, and that appears to fix the problem.

  Test plan:

  ```
  cd packages/wrangler
  npm run build
  cd ../workers-chat-demo
  npx wrangler dev --local
  ```

  Fixes https://github.com/cloudflare/workers-sdk/issues/443

* [#592](https://github.com/cloudflare/workers-sdk/pull/592) [`56886cf`](https://github.com/cloudflare/workers-sdk/commit/56886cfc7edf02cf0ae029f380a517c0142fd467) Thanks [@caass](https://github.com/caass)! - Stop reporting breadcrumbs to sentry

  Sentry's SDK automatically tracks "breadcrumbs", which are pieces of information
  that get tracked leading up to an exception. This can be useful for debugging
  errors because it gives better insight into what happens before an error occurs,
  so you can more easily understand and recreate exactly what happened before an
  error occurred.

  Unfortunately, Sentry automatically includes all `console` statements. And since
  we use the console a lot (e.g. logging every request received in `wrangler dev`),
  this is mostly useless. Additionally, since developers frequently use the console
  to debug their workers we end up with a bunch of data that is not only irrelevant
  to the reported error, but also contains data that could be potentially sensitive.

  For now, we're turning off breadcrumbs entirely. Later, we might wish to add our
  own breadcrumbs manually (e.g. add a "wrangler dev" breadcrumb when a user runs
  `wrangler dev`), at which point we can selectively enable breadcrumbs to catch
  only the ones we've put in there ourselves.

- [#645](https://github.com/cloudflare/workers-sdk/pull/645) [`61aea30`](https://github.com/cloudflare/workers-sdk/commit/61aea3052f90dc7a05f77dd2d60e8b32af143a83) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: improve authentication logging and warnings

  - If a user has previously logged in via Wrangler v1 with an API token, we now display a helpful warning.
  - When logging in and out, we no longer display the path to the internal user auh config file.
  - When logging in, we now display an initial message to indicate the authentication flow is starting.

  Fixes [#526](https://github.com/cloudflare/workers-sdk/issues/526)

* [#608](https://github.com/cloudflare/workers-sdk/pull/608) [`a7fa544`](https://github.com/cloudflare/workers-sdk/commit/a7fa544f4050f2b2eea573fcac784b148de25bc6) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - fix: Ensure generateConfigFromFileTree generates config correctly for multiple splats

  Functions with multiple parameters, like /near/[latitude]/[longitude].ts wouldn't work. This
  fixes that.

- [#580](https://github.com/cloudflare/workers-sdk/pull/580) [`8013e0a`](https://github.com/cloudflare/workers-sdk/commit/8013e0a86cb309f912bd1068725d4a5535795082) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add support for `--local-protocol=https` to `wrangler dev`

  This change adds full support for the setting the protocol that the localhost proxy server listens to.
  Previously, it was only possible to use `HTTP`. But now you can set it to `HTTPS` as well.

  To support `HTTPS`, Wrangler needs an SSL certificate.
  Wrangler now generates a self-signed certificate, as needed, and caches it in the `~/.wrangler/local-cert` directory.
  These certificates expire after 30 days and are regenerated by Wrangler as needed.

  Note that if you use HTTPS then your browser will complain about the self-signed and you must tell it to accept the certificate before it will let you access the page.

* [#639](https://github.com/cloudflare/workers-sdk/pull/639) [`5161e1e`](https://github.com/cloudflare/workers-sdk/commit/5161e1e85c4cb6604c54a791301e38cb90e57632) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: initialize the user auth state synchronously

  We can now initialize the user state synchronously, which means that
  we can remove the checks for whether it has been done or not in each
  of the user auth functions.

- [#580](https://github.com/cloudflare/workers-sdk/pull/580) [`aaac8dd`](https://github.com/cloudflare/workers-sdk/commit/aaac8ddfda9658a2cb35b757518ee085a994dfe5) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: validate that local_protocol and upstream_protocol can only take "http" or "https"

* [#568](https://github.com/cloudflare/workers-sdk/pull/568) [`b6f2266`](https://github.com/cloudflare/workers-sdk/commit/b6f226624417ffa4b5e7c3098d4955bc23d58603) Thanks [@caass](https://github.com/caass)! - Show an actionable error message when publishing to a workers.dev subdomain that hasn't been created yet.

  When publishing a worker to workers.dev, you need to first have registered your workers.dev subdomain
  (e.g. my-subdomain.workers.dev). We now check to ensure that the user has created their subdomain before
  uploading a worker to workers.dev, and if they haven't, we provide a link to where they can go through
  the workers onboarding flow and create one.

- [#641](https://github.com/cloudflare/workers-sdk/pull/641) [`21ee93e`](https://github.com/cloudflare/workers-sdk/commit/21ee93e40ad5870328f22f106113ffc88a212894) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: error if a non-legacy service environment tries to define a worker name

  Given that service environments all live off the same worker, it doesn't make sense
  for them to have different names.

  This change adds validation to tell the developer to remove such `name` fields in
  service environment config.

  Fixes #623

* [#646](https://github.com/cloudflare/workers-sdk/pull/646) [`c75cfb8`](https://github.com/cloudflare/workers-sdk/commit/c75cfb83df4c98d6f678535439483948ce9fff5b) Thanks [@threepointone](https://github.com/threepointone)! - fix: default `watch_dir` to `src` of project directory

  Via Wrangler v1, when using custom builds in `wrangler dev`, `watch_dir` should default to `src` of the "project directory" (i.e - wherever the `wrangler.toml` is defined if it exists, else in the cwd.

  Fixes https://github.com/cloudflare/workers-sdk/issues/631

- [#621](https://github.com/cloudflare/workers-sdk/pull/621) [`e452a04`](https://github.com/cloudflare/workers-sdk/commit/e452a041fbe7439eff88ab34a1d2124ee0dff40a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: stop checking for open port once it has timed out in `waitForPortToBeAvailable()`

  Previously, if `waitForPortToBeAvailable()` timed out, the `checkPort()`
  function would continue to be called.
  Now we clean up fully once the promise is resolved or rejected.

* [#600](https://github.com/cloudflare/workers-sdk/pull/600) [`1bbd834`](https://github.com/cloudflare/workers-sdk/commit/1bbd8340d2f9868e6384e2ef58e6f73ec6b6dda7) Thanks [@skirsten](https://github.com/skirsten)! - fix: use environment specific and inherited config values in `publish`

- [#577](https://github.com/cloudflare/workers-sdk/pull/577) [`7faf0eb`](https://github.com/cloudflare/workers-sdk/commit/7faf0ebec1aa92f64c1a1d0d702d03f4cfa868cd) Thanks [@threepointone](https://github.com/threepointone)! - fix: `config.site.entry-point` as a breaking deprecation

  This makes configuring `site.entry-point` in config as a breaking deprecation, and throws an error. We do this because existing apps with `site.entry-point` _won't_ work in v2.

* [#578](https://github.com/cloudflare/workers-sdk/pull/578) [`c56847c`](https://github.com/cloudflare/workers-sdk/commit/c56847cb261e9899d60b50599f910efa9cefdee9) Thanks [@threepointone](https://github.com/threepointone)! - fix: gracefully fail if we can't create `~/.wrangler/reporting.toml`

  In some scenarios (CI/CD, docker, etc), we won't have write access to `~/.wrangler`. We already don't write a configuration file there if one passes a `CF_API_TOKEN`/`CLOUDFLARE_API_TOKEN` env var. This also adds a guard when writing the error reporting configuration file.

- [#621](https://github.com/cloudflare/workers-sdk/pull/621) [`e452a04`](https://github.com/cloudflare/workers-sdk/commit/e452a041fbe7439eff88ab34a1d2124ee0dff40a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: check for the correct inspector port in local dev

  Previously, the `useLocalWorker()` hook was being passed the wrong port for the `inspectorPort` prop.

  Once this was fixed, it became apparent that we were waiting for the port to become free in the wrong place, since this port is already being listened to in `useInspector()` by the time we were starting the check.

  Now, the check to see if the inspector port is free is done in `useInspector()`,
  which also means that `Remote` benefits from this check too.

* [#587](https://github.com/cloudflare/workers-sdk/pull/587) [`49869a3`](https://github.com/cloudflare/workers-sdk/commit/49869a367d5f5dc71c9f48e0daf1f5047b482185) Thanks [@threepointone](https://github.com/threepointone)! - feat: expire unused assets in `[site]` uploads

  This expires any previously uploaded assets when using a Sites / `[site]` configuration. Because we currently do a full iteration of a namespace's keys when publishing, for rapidly changing sites this means that uploads get slower and slower. We can't just delete unused assets because it leads to occasional 404s on older publishes while we're publishing. So we expire previous assets while uploading new ones. The implementation/constraints of the kv api means that uploads may become slower, but should hopefully be faster overall. These optimisations also only matter for rapidly changing sites, so common usecases still have the same perf characteristics.

- [#580](https://github.com/cloudflare/workers-sdk/pull/580) [`9ef36a9`](https://github.com/cloudflare/workers-sdk/commit/9ef36a903988d3c18982186ca272ff4d026ad8b2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: improve validation error message for fields that must be one of a selection of choices

## 0.0.19

### Patch Changes

- [#557](https://github.com/cloudflare/workers-sdk/pull/557) [`835c3ae`](https://github.com/cloudflare/workers-sdk/commit/835c3ae061f7b0dd67fa5e0bd56c445cb6666bf8) Thanks [@threepointone](https://github.com/threepointone)! - fix: wrangler dev on unnamed workers in remote mode

  With unnamed workers, we use the filename as the name of the worker, which isn't a valid name for workers because of the `.` (This break was introduced in https://github.com/cloudflare/workers-sdk/pull/545). The preview service accepts unnamed workers and generates a hash anyway, so the fix is to simply not send it, and use the host that the service provides.

## 0.0.18

### Patch Changes

- [#523](https://github.com/cloudflare/workers-sdk/pull/523) [`8c99449`](https://github.com/cloudflare/workers-sdk/commit/8c99449b7d1ae4eb86607a4e1ff13fd012e6ec8c) Thanks [@threepointone](https://github.com/threepointone)! - feat: secrets + environments

  This implements environment support for `wrangler secret` (both legacy and services). We now consistently generate the right script name across commands with the `getScriptName()` helper.

  Based on the work by @mitchelvanbever in https://github.com/cloudflare/workers-sdk/pull/95.

* [#554](https://github.com/cloudflare/workers-sdk/pull/554) [`18ac439`](https://github.com/cloudflare/workers-sdk/commit/18ac4398f8f6e3ed3d663ee61ceb7388510390aa) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: limit bulk put API requests to batches of 5,000

  The `kv:bulk put` command now batches up put requests in groups of 5,000,
  displaying progress for each request.

- [#437](https://github.com/cloudflare/workers-sdk/pull/437) [`2805205`](https://github.com/cloudflare/workers-sdk/commit/2805205d83fa6c960351d38517c8a4169067e4e6) Thanks [@jacobbednarz](https://github.com/jacobbednarz)! - feat: use `CLOUDFLARE_...` environment variables deprecating `CF_...`

  Now one should use `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_BASE_URL` rather than `CF_API_TOKEN`, `CF_ACCOUNT_ID` and `CF_API_BASE_URL`, which have been deprecated.

  If you use the deprecated variables they will still work but you will see a warning message.

  Within the Cloudflare tooling ecosystem, we have a mix of `CF_` and `CLOUDFLARE_`
  for prefixing environment variables. Until recently, many of the tools
  were fine with `CF_` however, there started to be conflicts with
  external tools (such as Cloudfoundary CLI), which also uses `CF_` as a
  prefix, and would potentially be reading and writing the same value the
  Cloudflare tooling.

  The Go SDK[1], Terraform[2] and cf-terraforming[3] have made the jump to
  the `CLOUDFLARE_` prefix for environment variable prefix.

  In future, all SDKs will use this prefix for consistency and to allow all the tooling to reuse the same environment variables in the scenario where they are present.

  [1]: https://github.com/cloudflare/cloudflare-go
  [2]: https://github.com/cloudflare/terraform-provider-cloudflare
  [3]: https://github.com/cloudflare/cf-terraforming

* [#530](https://github.com/cloudflare/workers-sdk/pull/530) [`fdb4afd`](https://github.com/cloudflare/workers-sdk/commit/fdb4afdaf10bbc72c0f4d643f752f6aafe529058) Thanks [@threepointone](https://github.com/threepointone)! - feat: implement `rules` config field

  This implements the top level `rules` configuration field. It lets you specify transport rules for non-js modules. For example, you can specify `*.md` files to be included as a text file with -

  ```
  [[rules]]
  {type = "Text", globs = ["**/*.md"]}
  ```

  We also include a default ruleset -

  ```
    { type: "Text", globs: ["**/*.txt", "**/*.html"] },
    { type: "Data", globs: ["**/*.bin"] },
    { type: "CompiledWasm", globs: ["**/*.wasm"] },
  ```

  More info at https://developers.cloudflare.com/workers/cli-wrangler/configuration/#build.

  Known issues -

  - non-wasm module types do not work in `--local` mode
  - `Data` type does not work in service worker format, in either mode

- [#517](https://github.com/cloudflare/workers-sdk/pull/517) [`201a6bb`](https://github.com/cloudflare/workers-sdk/commit/201a6bb6db51ab3dde16fc496ab3c93b91d1de81) Thanks [@threepointone](https://github.com/threepointone)! - fix: publish environment specific routes

  This adds some tests for publishing routes, and fixes a couple of bugs with the flow.

  - fixes publishing environment specific routes, closes https://github.com/cloudflare/workers-sdk/issues/513
  - default `workers_dev` to `false` if there are any routes specified
  - catches a hanging promise when we were toggling off a `workers.dev` subdomain (which should have been caught by the `no-floating-promises` lint rule, so that's concerning)
  - this also fixes publishing environment specific crons, but I'll write tests for that when I'm doing that feature in depth

* [#528](https://github.com/cloudflare/workers-sdk/pull/528) [`26f5ad2`](https://github.com/cloudflare/workers-sdk/commit/26f5ad23a98839ffaa3627681b36c58a656407a4) Thanks [@threepointone](https://github.com/threepointone)! - feat: top level `main` config field

  This implements a top level `main` field for `wrangler.toml` to define an entry point for the worker , and adds a deprecation warning for `build.upload.main`. The deprecation warning is detailed enough to give the exact line to copy-paste into your config file. Example -

  ```
  The `build.upload` field is deprecated. Delete the `build.upload` field, and add this to your configuration file:

  main = "src/chat.mjs"
  ```

  This also makes `./dist` a default for `build.upload.dir`, to match Wrangler v1's behaviour.

  Closes https://github.com/cloudflare/workers-sdk/issues/488

- [#521](https://github.com/cloudflare/workers-sdk/pull/521) [`5947bfe`](https://github.com/cloudflare/workers-sdk/commit/5947bfe469d03af3838240041814a9a1eb8f8bb6) Thanks [@threepointone](https://github.com/threepointone)! - chore: update esbuild from 0.14.18 to 0.14.23

* [#480](https://github.com/cloudflare/workers-sdk/pull/480) [`10cb789`](https://github.com/cloudflare/workers-sdk/commit/10cb789a3884db17c757a6f619c98abd930ced22) Thanks [@caass](https://github.com/caass)! - Refactored tail functionality in preparation for adding pretty printing.

  - Moved the `debug` toggle from a build-time constant to a (hidden) CLI flag
  - Implemented pretty-printing logs, togglable via `--format pretty` CLI option
  - Added stronger typing for tail event messages

- [#525](https://github.com/cloudflare/workers-sdk/pull/525) [`9d5c14d`](https://github.com/cloudflare/workers-sdk/commit/9d5c14db4e24db0e60ef83cdd40bfc7b5e9060b8) Thanks [@threepointone](https://github.com/threepointone)! - feat: tail+envs

  This implements service environment support for `wrangler tail`. Fairly simple, we just generate the right URLs. wrangler tail already works for legacy envs, so there's nothing to do there.

* [#553](https://github.com/cloudflare/workers-sdk/pull/553) [`bc85682`](https://github.com/cloudflare/workers-sdk/commit/bc85682028c70a1c4aff96d8f2e4314dc75d6785) Thanks [@threepointone](https://github.com/threepointone)! - feat: disable tunnel in `wrangler dev`

  Disables sharing local development server on the internet. We will bring this back after it's more polished/ready.

  Fixes https://github.com/cloudflare/workers-sdk/issues/550

- [#522](https://github.com/cloudflare/workers-sdk/pull/522) [`a283836`](https://github.com/cloudflare/workers-sdk/commit/a283836577371bc3287d28e3671db9efe94400a1) Thanks [@threepointone](https://github.com/threepointone)! - fix: websockets

  This fixes websockets in `wrangler dev`. It looks like we broke it in https://github.com/cloudflare/workers-sdk/pull/503. I've reverted the specific changes made to `proxy.ts`.

  Test plan -

  ```
  cd packages/wrangler
  npm run build
  cd ../workers-chat-demo
  npx wrangler dev

  ```

* [#481](https://github.com/cloudflare/workers-sdk/pull/481) [`8874548`](https://github.com/cloudflare/workers-sdk/commit/88745484106a37e862d5de56ae4b7599775d7e59) Thanks [@threepointone](https://github.com/threepointone)! - fix: replace the word "deploy" with "publish" everywhere.

  We should be consistent with the word that describes how we get a worker to the edge. The command is `publish`, so let's use that everywhere.

- [#537](https://github.com/cloudflare/workers-sdk/pull/537) [`b978db4`](https://github.com/cloudflare/workers-sdk/commit/b978db400e5c56d393e4f469b3ca5557994f8102) Thanks [@threepointone](https://github.com/threepointone)! - feat: `--local` mode only applies in `wrangler dev`

  We'd originally planned for `--local` mode to be a thing across all wrangler commands. In hindsight, that didn't make much sense, since every command other than `wrangler dev` assumes some interaction with cloudflare and their API. The only command other than dev where this "worked" was `kv`, but even that didn't make sense because wrangler dev wouldn't even read from it. We also have `--experimental-enable-local-persistence` there anyway.

  So this moves the `--local` flag to only apply for `wrangler dev` and removes any trace from other commands.

* [#518](https://github.com/cloudflare/workers-sdk/pull/518) [`72f035e`](https://github.com/cloudflare/workers-sdk/commit/72f035e47a586fd02278674b1b160f5cb34d1412) Thanks [@threepointone](https://github.com/threepointone)! - feat: implement `[text_blobs]`

  This implements support for `[text_blobs]` as defined by https://github.com/cloudflare/wrangler-legacy/pull/1677.

  Text blobs can be defined in service-worker format with configuration in `wrangler.toml` as -

  ```
  [text_blobs]
  MYTEXT = "./path/to/my-text.file"
  ```

  The content of the file will then be available as the global `MYTEXT` inside your code. Note that this ONLY makes sense in service-worker format workers (for now).

  Workers Sites now uses `[text_blobs]` internally. Previously, we were inlining the asset manifest into the worker itself, but we now attach the asset manifest to the uploaded worker. I also added an additional example of Workers Sites with a modules format worker.

- [#532](https://github.com/cloudflare/workers-sdk/pull/532) [`046b17d`](https://github.com/cloudflare/workers-sdk/commit/046b17d7a8721aafd5d50c40c7bf193dceea82f4) Thanks [@threepointone](https://github.com/threepointone)! - feat: dev+envs

  This implements service environments + `wrangler dev`. Fairly simple, it just needed the right url when creating the edge preview token.

  I tested this by publishing a service under one env, adding secrets under it in the dashboard, and then trying to dev under another env, and verifying that the secrets didn't leak.

* [#552](https://github.com/cloudflare/workers-sdk/pull/552) [`3cee150`](https://github.com/cloudflare/workers-sdk/commit/3cee1508d14c118f8ad817cfbf9992c3ca343bce) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add confirmation and success messages to `kv:bulk delete` command

  Added the following:

  - When the deletion completes, we get `Success!` logged to the console.
  - Before deleting, the user is now asked to confirm is that is desired.
  - A new flag `--force`/`-f` to avoid the confirmation check.

- [#533](https://github.com/cloudflare/workers-sdk/pull/533) [`1b3a5f7`](https://github.com/cloudflare/workers-sdk/commit/1b3a5f74b2f7ae5ed47d09c96ccb055d4b4cdfe8) Thanks [@threepointone](https://github.com/threepointone)! - feat: default to legacy environments

  While implementing support for service environments, we unearthed a small number of usage issues. While we work those out, we should default to using regular "legacy" environments.

* [#519](https://github.com/cloudflare/workers-sdk/pull/519) [`93576a8`](https://github.com/cloudflare/workers-sdk/commit/93576a853b6eff3810bdccb4b7496d77b5eb5416) Thanks [@caass](https://github.com/caass)! - fix: Improve port selection for `wrangler dev` for both worker ports and inspector ports.

  Previously when running `wrangler dev` on multiple workers at the same time, you couldn't attach DevTools to both workers, since they were both listening on port 9229.
  With this PR, that behavior is improved -- you can now pass an `--inspector-port` flag to specify a port for DevTools to connect to on a per-worker basis, or
  if the option is omitted, wrangler will assign a random unused port for you.

  This "if no option is given, assign a random unused port" behavior has also been added to `wrangler dev --port`, so running `wrangler dev` on two
  workers at once should now "just work". Hopefully.

- [#545](https://github.com/cloudflare/workers-sdk/pull/545) [`9e89dd7`](https://github.com/cloudflare/workers-sdk/commit/9e89dd7f868e10fcd3e09789f6f6a59dff8ed4e3) Thanks [@threepointone](https://github.com/threepointone)! - feat: zoned worker support for `wrangler dev`

  This implements support for zoned workers in `wrangler dev`. Of note, since we're deprecating `zone_id`, we instead use the domain provided via `--host`/`config.dev.host`/`--routes`/`--route`/`config.routes`/`config.route` and infer the zone id from it.

  Fixes https://github.com/cloudflare/workers-sdk/issues/544

* [#494](https://github.com/cloudflare/workers-sdk/pull/494) [`6e6c30f`](https://github.com/cloudflare/workers-sdk/commit/6e6c30f7a32656c6db9f54318ffec6da147d45f6) Thanks [@caass](https://github.com/caass)! - - Add tests covering pretty-printing of logs in `wrangler tail`
  - Modify `RequestEvent` types
    - Change `Date` types to `number` to make parsing easier
    - Change `exception` and `log` `message` properties to `unknown`
  - Add datetime to pretty-printed request events

- [#496](https://github.com/cloudflare/workers-sdk/pull/496) [`5a640f0`](https://github.com/cloudflare/workers-sdk/commit/5a640f0bcee7626cb8a969c89b8de7751d553df3) Thanks [@jahands](https://github.com/jahands)! - chore: Remove acorn/acorn-walk dependency used in Pages Functions filepath-routing.

  This shouldn't cause any functional changes, Pages Functions filepath-routing now uses esbuild to find exports.

* [#419](https://github.com/cloudflare/workers-sdk/pull/419) [`04f4332`](https://github.com/cloudflare/workers-sdk/commit/04f43329a252fac297bb9e8330cd934f5e96726c) Thanks [@Electroid](https://github.com/Electroid)! - refactor: use esbuild's message formatting for cleaner error messages

  This is the first step in making a standard format for error messages. For now, this uses esbuild's error formatting, which is nice and colored, but we could decide to customize our own later. Moreover, we should use the `parseJSON`, `parseTOML`, and `readFile` utilities so there are pretty errors for any configuration.

- [#501](https://github.com/cloudflare/workers-sdk/pull/501) [`824d8c0`](https://github.com/cloudflare/workers-sdk/commit/824d8c03adae369608a26122b0071583b2ae0674) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: delegate deprecated `preview` command to `dev` if possible

  The `preview` command is deprecated and not supported in this version of Wrangler.
  Instead, one should use the `dev` command for most `preview` use-cases.

  This change attempts to delegate any use of `preview` to `dev` failing if the command line contains positional arguments that are not compatible with `dev`.

  Resolves #9

* [#541](https://github.com/cloudflare/workers-sdk/pull/541) [`371e6c5`](https://github.com/cloudflare/workers-sdk/commit/371e6c581a26bd011f416de8417a2c2ca1b60097) Thanks [@threepointone](https://github.com/threepointone)! - chore: refactor some common code into `requireAuth()`

  There was a common chunk of code across most commands that ensures a user is logged in, and retrieves an account ID. I'd resisted making this into an abstraction for a while. Now that the codebase is stable, and https://github.com/cloudflare/workers-sdk/pull/537 removes some surrounding code there, I made an abstraction for this common code as `requireAuth()`. This gets a mention in the changelog simply because it touches a bunch of code, although it's mostly mechanical deletion/replacement.

- [#551](https://github.com/cloudflare/workers-sdk/pull/551) [`afd4b0e`](https://github.com/cloudflare/workers-sdk/commit/afd4b0ed2c9fc95238b69c6fd86740243f58b049) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: do not log the `null` returned from `kv:bulk put` and `kv:bulk delete`

* [#503](https://github.com/cloudflare/workers-sdk/pull/503) [`e5c7ed8`](https://github.com/cloudflare/workers-sdk/commit/e5c7ed8b17033fc6a9e77a9429cb32fa54b5d8fb) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refact: consolidate on `ws` websocket library

  Removes the `faye-websocket` library and uses `ws` across the code base.

- [#502](https://github.com/cloudflare/workers-sdk/pull/502) [`b30349a`](https://github.com/cloudflare/workers-sdk/commit/b30349ac6b258c0c274606959d9d31bb8efb08d7) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix(pages): ensure remaining args passed to `pages dev` command are captured

  It is common to pass additional commands to `pages dev` to generate the input source.
  For example:

  ```bash
  npx wrangler pages dev -- npm run dev
  ```

  Previously the args after `--` were being dropped.
  This change ensures that these are captured and used correctly.

  Fixes #482

* [#512](https://github.com/cloudflare/workers-sdk/pull/512) [`b093df7`](https://github.com/cloudflare/workers-sdk/commit/b093df775cc762517666bd68361cc37c5e936a9a) Thanks [@threepointone](https://github.com/threepointone)! - feat: a better `tsconfig.json`

  This makes a better `tsconfig.json` when using `wrangler init`. Of note, it takes the default `tsconfig.json` generated by `tsc --init`, and adds our modifications.

- [#510](https://github.com/cloudflare/workers-sdk/pull/510) [`9534c7f`](https://github.com/cloudflare/workers-sdk/commit/9534c7fd1351daacaed63b3a3e2fafa884b515a8) Thanks [@threepointone](https://github.com/threepointone)! - feat: `--legacy-env` cli arg / `legacy_env` config

  This is the first of a few changes to codify how we do environments in wrangler2, both older legacy style environments, and newer service environments. Here, we add a cli arg and a config field for specifying whether to enable/disable legacy style environments, and pass it on to dev/publish commands. We also fix how we were generating kv namespaces for Workers Sites, among other smaller fixes.

* [#549](https://github.com/cloudflare/workers-sdk/pull/549) [`3d2ce01`](https://github.com/cloudflare/workers-sdk/commit/3d2ce01a48acfb759147de5d94667eef77d9f16e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: kv:bulk should JSON encode its contents

  The body passed to `kv:bulk delete` and `kv:bulk put` must be JSON encoded.
  This change fixes that and adds some tests to prove it.

  Fixes #547

- [#554](https://github.com/cloudflare/workers-sdk/pull/554) [`6e5319b`](https://github.com/cloudflare/workers-sdk/commit/6e5319bd7a3685afa0e0b7c3e9bb81831b89e88f) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: limit bulk delete API requests to batches of 5,000

  The `kv:bulk delete` command now batches up delete requests in groups of 5,000,
  displaying progress for each request.

* [#538](https://github.com/cloudflare/workers-sdk/pull/538) [`4b6c973`](https://github.com/cloudflare/workers-sdk/commit/4b6c973dfdaf44429a47c8da387f9bc706ef4664) Thanks [@threepointone](https://github.com/threepointone)! - feat: with `wrangler init`, create a new directory for named workers

  Currently, when creating a new project, we usually first have to create a directory before running `wrangler init`, since it defaults to creating the `wrangler.toml`, `package.json`, etc in the current working directory. This fix introduces an enhancement, where using the `wrangler init [name]` form creates a directory named `[name]` and initialises the project files inside it. This matches the usage pattern a little better, and still preserves the older behaviour when we're creating a worker inside existing projects.

- [#548](https://github.com/cloudflare/workers-sdk/pull/548) [`e3cab74`](https://github.com/cloudflare/workers-sdk/commit/e3cab749650c70c313d9e2cc645c9656ea6be036) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: clean up unnecessary async functions

  The `readFile()` and `readConfig()` helpers do not need to be async.
  Doing so just adds complexity to their call sites.

* [#529](https://github.com/cloudflare/workers-sdk/pull/529) [`9d7e946`](https://github.com/cloudflare/workers-sdk/commit/9d7e946608c54ca283b74885d5d547a87c02a79b) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add more comprehensive config validation checking

  The configuration for a Worker is complicated since we can define different "environments", and each environment can have its own configuration.
  There is a default ("top-level") environment and then named environments that provide environment specific configuration.

  This is further complicated by the fact that there are three kinds of environment configuration:

  - **non-overridable**: these values are defined once in the top-level configuration, apply to all environments and cannot be overridden by an environment.
  - **inheritable**: these values can be defined at the top-level but can also be overridden by environment specific values.
    Named environments do not need to provide their own values, in which case they inherit the value from the top-level.
  - **non-inheritable**: these values must be explicitly defined in each environment if they are defined at the top-level.
    Named environments do not inherit such configuration and must provide their own values.

  All configuration values in `wrangler.toml` are optional and will receive a default value if not defined.

  This change adds more strict interfaces for top-level `Config` and `Environment` types,
  as well as validation and normalization of the optional fields that are read from `wrangler.toml`.

- [#486](https://github.com/cloudflare/workers-sdk/pull/486) [`ff8c9f6`](https://github.com/cloudflare/workers-sdk/commit/ff8c9f6cf9f6bf2922df74ea1083d12153a64ae0) Thanks [@threepointone](https://github.com/threepointone)! - fix: remove warning if worker with a durable object doesn't have a name

  We were warning if you were trying to develop a durable object with an unnamed worker. Further, the internal api would actually throw if you tried to develop with a named worker if it wasn't already published. The latter is being fixed internally and should live soon, and this fix removes the warning completely.

## 0.0.17

### Patch Changes

- [#414](https://github.com/cloudflare/workers-sdk/pull/414) [`f30426f`](https://github.com/cloudflare/workers-sdk/commit/f30426fad5cd0be7f8a2e197a6ea279c0798bf15) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: support `build.upload.dir` when using `build.upload.main`

  Although, `build.upload.dir` is deprecated, we should still support using it when the entry-point is being defined by the `build.upload.main` and the format is `modules`.

  Fixes #413

* [#447](https://github.com/cloudflare/workers-sdk/pull/447) [`2c5c934`](https://github.com/cloudflare/workers-sdk/commit/2c5c934ce3343bbda0430fe91e1ea3eb94757fa3) Thanks [@threepointone](https://github.com/threepointone)! - fix: Config should be resolved relative to the entrypoint

  During `dev` and `publish`, we should resolve `wrangler.toml` starting from the entrypoint, and then working up from there. Currently, we start from the directory from which we call `wrangler`, this changes that behaviour to start from the entrypoint instead.

  (To implement this, I made one big change: Inside commands, we now have to explicitly read configuration from a path, instead of expecting it to 'arrive' coerced into a configuration object.)

- [#472](https://github.com/cloudflare/workers-sdk/pull/472) [`804523a`](https://github.com/cloudflare/workers-sdk/commit/804523aff70e7dd76aea25e22d4a7530da62b748) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - bugfix: Replace `.destroy()` on `faye-websockets` with `.close()`
  added: Interface to give faye same types as compliant `ws` with additional `.pipe()` implementation; `.on("message" => fn)`

* [#462](https://github.com/cloudflare/workers-sdk/pull/462) [`a173c80`](https://github.com/cloudflare/workers-sdk/commit/a173c80a6acd07dcce8b4d8c11d3577b19efb1f9) Thanks [@caass](https://github.com/caass)! - Add filtering to wrangler tail, so you can now `wrangler tail <name> --status ok`, for example. Supported options:

  - `--status cancelled --status error` --> you can filter on `ok`, `error`, and `cancelled` to only tail logs that have that status
  - `--header X-CUSTOM-HEADER:somevalue` --> you can filter on headers, including ones that have specific values (`"somevalue"`) or just that contain any header (e.g. `--header X-CUSTOM-HEADER` with no colon)
  - `--method POST --method PUT` --> filter on the HTTP method used to trigger the worker
  - `--search catch-this` --> only shows messages that contain the phrase `"catch-this"`. Does not (yet!) support regular expressions
  - `--ip self --ip 192.0.2.232` --> only show logs from requests that originate from the given IP addresses. `"self"` will be replaced with the IP address of the computer that sent the tail request.

- [#471](https://github.com/cloudflare/workers-sdk/pull/471) [`21cde50`](https://github.com/cloudflare/workers-sdk/commit/21cde504de028e58af3dc4c0e0d3f2726c7f4c1d) Thanks [@caass](https://github.com/caass)! - Add tests for wrangler tail:

  - ensure the correct API calls are made
  - ensure that filters are sent
  - ensure that the _correct_ filters are sent
  - ensure that JSON gets spat out into the terminal

* [#398](https://github.com/cloudflare/workers-sdk/pull/398) [`40d9553`](https://github.com/cloudflare/workers-sdk/commit/40d955341d6c14fde51ff622a9c7371e5c6049c1) Thanks [@threepointone](https://github.com/threepointone)! - feat: guess-worker-format

  This formalises the logic we use to "guess"/infer what a worker's format is - either "modules" or "service worker". Previously we were using the output of the esbuild process metafile to infer this, we now explicitly do so in a separate step (esbuild's so fast that it doesn't have any apparent performance hit, but we also do a simpler form of the build to get this information).

  This also adds `--format` as a command line arg for `publish`.

- [#438](https://github.com/cloudflare/workers-sdk/pull/438) [`64d62be`](https://github.com/cloudflare/workers-sdk/commit/64d62bede0ccb4f66e4a474a2c7f100606c65042) Thanks [@Electroid](https://github.com/Electroid)! - feat: Add support for "json" bindings

  Did you know? We have support for "json" bindings! Here are a few examples:

  [vars]
  text = "plain ol' string"
  count = 1
  complex = { enabled = true, id = 123 }

* [#422](https://github.com/cloudflare/workers-sdk/pull/422) [`ef13735`](https://github.com/cloudflare/workers-sdk/commit/ef137352697e440a0007c5a099503ad2f4526eaf) Thanks [@threepointone](https://github.com/threepointone)! - chore: rename `open-in-brower.ts` to `open-in-browser.ts`

- [#411](https://github.com/cloudflare/workers-sdk/pull/411) [`a52f0e0`](https://github.com/cloudflare/workers-sdk/commit/a52f0e00f85fa7602f30b9540b060b60968adf23) Thanks [@ObsidianMinor](https://github.com/ObsidianMinor)! - feat: unsafe-bindings

  Adds support for "unsafe bindings", that is, bindings that aren't supported by wrangler, but are
  desired when uploading a Worker to Cloudflare. This allows you to use beta features before
  official support is added to wrangler, while also letting you migrate to proper support for the
  feature when desired. Note: these bindings may not work everywhere, and may break at any time.

* [#415](https://github.com/cloudflare/workers-sdk/pull/415) [`d826f5a`](https://github.com/cloudflare/workers-sdk/commit/d826f5aae2d05023728d8ee5e30ffb79c0d674a5) Thanks [@threepointone](https://github.com/threepointone)! - fix: don't crash when browser windows don't open

  We open browser windows for a few things; during `wrangler dev`, and logging in. There are environments where this doesn't work as expected (like codespaces, stackblitz, etc). This fix simply logs an error instead of breaking the flow. This is the same fix as https://github.com/cloudflare/workers-sdk/pull/263, now applied to the rest of wrangler.

- [`91d8994`](https://github.com/cloudflare/workers-sdk/commit/91d89943cda26a197cb7c8d752d7953a97fac338) Thanks [@Mexican-Man](https://github.com/Mexican-Man)! - fix: do not merge routes with different methods when computing pages routes

  Fixes #92

* [#474](https://github.com/cloudflare/workers-sdk/pull/474) [`bfedc58`](https://github.com/cloudflare/workers-sdk/commit/bfedc585f151898615b3546fc67d97055e32d6ed) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - bugfix: create `reporting.toml` file in "wrangler/config" and move error reporting user decisions to new `reporting.toml`

- [#445](https://github.com/cloudflare/workers-sdk/pull/445) [`d5935e7`](https://github.com/cloudflare/workers-sdk/commit/d5935e7c4fde9e3b900be7c08bca09e80e9fdc8a) Thanks [@threepointone](https://github.com/threepointone)! - chore: remove `experimental_services` from configuration

  Now that we have `[[unsafe.bindings]]` (as of https://github.com/cloudflare/workers-sdk/pull/411), we should use that for experimental features. This removes support for `[experimental_services]`, and adds a helpful message for how to rewrite their configuration.

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

* [#456](https://github.com/cloudflare/workers-sdk/pull/456) [`b5f42c5`](https://github.com/cloudflare/workers-sdk/commit/b5f42c587300c313bdebab4d364d0c7759e39752) Thanks [@threepointone](https://github.com/threepointone)! - chore: enable `strict` in `tsconfig.json`

  In the march towards full strictness, this enables `strict` in `tsconfig.json` and fixes the errors it pops up. A changeset is included because there are some subtle code changes, and we should leave a trail for them.

- [#408](https://github.com/cloudflare/workers-sdk/pull/408) [`14098af`](https://github.com/cloudflare/workers-sdk/commit/14098af0886b0cbdda90823527ca6037770375b3) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to [`2.3.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.3.0)

* [#448](https://github.com/cloudflare/workers-sdk/pull/448) [`b72a111`](https://github.com/cloudflare/workers-sdk/commit/b72a111bbe92dc3b83a3d9e59ff3b5935bee7dbc) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: add `--yes` with alias `--y` flag as automatic answer to all prompts and run `wrangler init` non-interactively.
  generated during setup:

  - package.json
  - TypeScript, which includes tsconfig.json & `@cloudflare/workers-types`
  - Template "hello world" Worker at src/index.ts

- [#403](https://github.com/cloudflare/workers-sdk/pull/403) [`f9fef8f`](https://github.com/cloudflare/workers-sdk/commit/f9fef8fbfe74d6a591ca1640639a18798c5469e6) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: add scripts to package.json & autogenerate name value when initializing a project
  To get wrangler init projects up and running with good ergonomics for deploying and development,
  added default scripts "start" & "deploy" with assumed TS or JS files in generated ./src/index.
  The name property is now derived from user input on `init <name>` or parent directory if no input is provided.

* [#452](https://github.com/cloudflare/workers-sdk/pull/452) [`1cf6701`](https://github.com/cloudflare/workers-sdk/commit/1cf6701f372f77c45dc460de81979128d3efebc2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add support for publishing workers with r2 bucket bindings

  This change adds the ability to define bindings in your `wrangler.toml` file
  for R2 buckets. These buckets will then be available in the environment
  passed to the worker at runtime.

  Closes #365

- [#458](https://github.com/cloudflare/workers-sdk/pull/458) [`a8f97e5`](https://github.com/cloudflare/workers-sdk/commit/a8f97e57a571df5acdd9512d5d992d65730c75fd) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: do not publish to workers.dev if workers_dev is false

  Previously we always published to the workers.dev subdomain, ignoring the `workers_dev` setting in the `wrangler.toml` configuration.

  Now we respect this configuration setting, and also disable an current workers.dev subdomain worker when we publish and `workers_dev` is `false`.

  Fixes #410

* [#457](https://github.com/cloudflare/workers-sdk/pull/457) [`b249e6f`](https://github.com/cloudflare/workers-sdk/commit/b249e6fb34c616ff54edde830bbdf8f5279991fb) Thanks [@threepointone](https://github.com/threepointone)! - fix: don't report intentional errors

  We shouldn't be reporting intentional errors, only exceptions. This removes reporting for all caught errors for now, until we filter all known errors, and then bring back reporting for unknown errors. We also remove a stray `console.warn()`.

- [#402](https://github.com/cloudflare/workers-sdk/pull/402) [`5a9bb1d`](https://github.com/cloudflare/workers-sdk/commit/5a9bb1dd6510511607c268e1709e0caa95d68f92) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: Added Wrangler TOML fields
  Additional field to get projects ready to publish as soon as possible.
  It will check if the Worker is named, if not then it defaults to using the parent directory name.

* [#227](https://github.com/cloudflare/workers-sdk/pull/227) [`97e15f5`](https://github.com/cloudflare/workers-sdk/commit/97e15f5372d298378e5bafd62798cddd6eeda27c) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feature: Sentry Integration
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

- [#427](https://github.com/cloudflare/workers-sdk/pull/427) [`bce731a`](https://github.com/cloudflare/workers-sdk/commit/bce731a5cfccb1dc5a79fb15b31c7c15e3adcdb4) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: share worker bundling between both `publish` and `dev` commands

  This changes moves the code that does the esbuild bundling into a shared file
  and updates the `publish` and `dev` to use it, rather than duplicating the
  behaviour.

  See #396
  Resolves #401

* [#458](https://github.com/cloudflare/workers-sdk/pull/458) [`c0cfd60`](https://github.com/cloudflare/workers-sdk/commit/c0cfd604b2f114f06416374cfadae08cdef15d3c) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: pass correct query param when uploading a script

  In f9c1423f0c5b6008f05b9657c9b84eb6f173563a the query param was incorrectly changed from
  `available_on_subdomain` to `available_on_subdomains`.

- [#432](https://github.com/cloudflare/workers-sdk/pull/432) [`78acd24`](https://github.com/cloudflare/workers-sdk/commit/78acd24f539942bf094a3a47aca995b0cfd3ef03) Thanks [@threepointone](https://github.com/threepointone)! - feat: import `.wasm` modules in service worker format workers

  This allows importing `.wasm` modules in service worker format workers. We do this by hijacking imports to `.wasm` modules, and instead registering them under `[wasm_modules]` (building on the work from https://github.com/cloudflare/workers-sdk/pull/409).

* [#409](https://github.com/cloudflare/workers-sdk/pull/409) [`f8bb523`](https://github.com/cloudflare/workers-sdk/commit/f8bb523ed1a41f20391381e5d130b2685558002e) Thanks [@threepointone](https://github.com/threepointone)! - feat: support `[wasm_modules]` for service-worker format workers

  This lands support for `[wasm_modules]` as defined by https://github.com/cloudflare/wrangler-legacy/pull/1677.

  wasm modules can be defined in service-worker format with configuration in wrangler.toml as -

  ```
  [wasm_modules]
  MYWASM = "./path/to/my-wasm.wasm"
  ```

  The module will then be available as the global `MYWASM` inside your code. Note that this ONLY makes sense in service-worker format workers (for now).

  (In the future, we MAY enable wasm module imports in service-worker format (i.e. `import MYWASM from './path/to/my-wasm.wasm'`) and global imports inside modules format workers.)

- [#423](https://github.com/cloudflare/workers-sdk/pull/423) [`dd9058d`](https://github.com/cloudflare/workers-sdk/commit/dd9058d134eead969841136279e57df8203e84d9) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add support for managing R2 buckets

  This change introduces three new commands, which manage buckets under the current account:

  - `r2 buckets list`: list information about all the buckets.
  - `r2 buckets create`: create a new bucket - will error if the bucket already exists.
  - `r2 buckets delete`: delete a bucket.

  This brings Wrangler 2 inline with the same features in Wrangler v1.

* [#455](https://github.com/cloudflare/workers-sdk/pull/455) [`80aa106`](https://github.com/cloudflare/workers-sdk/commit/80aa10660ee0ef1e6e571b1312a2aa4c8562f543) Thanks [@threepointone](https://github.com/threepointone)! - fix: error when entry doesn't exist

  This adds an error when we use an entry point that doesn't exist, either for `wrangler dev` or `wrangler publish`, and either via cli arg or `build.upload.main` in `wrangler.toml`. By using a common abstraction for `dev` and `publish`, This also adds support for using `build.config.main`/`build.config.dir` for `wrangler dev`.

  - Fixes https://github.com/cloudflare/workers-sdk/issues/418
  - Fixes https://github.com/cloudflare/workers-sdk/issues/390

## 0.0.16

### Patch Changes

- [#364](https://github.com/cloudflare/workers-sdk/pull/364) [`3575892`](https://github.com/cloudflare/workers-sdk/commit/3575892f99d7a77031d566a12b4a383c886cc64f) Thanks [@threepointone](https://github.com/threepointone)! - enhance: small tweaks to `wrangler init`

  - A slightly better `package.json`
  - A slightly better `tsconfig.json`
  - installing `typescript` as a dev dependency

* [#380](https://github.com/cloudflare/workers-sdk/pull/380) [`aacd1c2`](https://github.com/cloudflare/workers-sdk/commit/aacd1c2a4badb273878cda13fda56e4b21bdd9cd) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: ensure pages routes are defined correctly

  In e151223 we introduced a bug where the RouteKey was now an array rather than a simple URL string. When it got stringified into the routing object these were invalid.
  E.g. `[':page*', undefined]` got stringified to `":page*,"` rather than `":page*"`.

  Fixes #379

- [#329](https://github.com/cloudflare/workers-sdk/pull/329) [`27a1f3b`](https://github.com/cloudflare/workers-sdk/commit/27a1f3b303fab855592f9ca980c770a4a0d85ec6) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - ci: run PR jobs on both Ubuntu, MacOS and Windows

  - update .gitattributes to be consistent on Windows
  - update Prettier command to ignore unknown files
    Windows seems to be more brittle here.
  - tighten up eslint config
    Windows seems to be more brittle here as well.
  - use the matrix.os value in the cache key
    Previously we were using `running.os` but this appeared not to be working.

* [#347](https://github.com/cloudflare/workers-sdk/pull/347) [`ede5b22`](https://github.com/cloudflare/workers-sdk/commit/ede5b2219fe636e376ae8a0e56978a33df448215) Thanks [@threepointone](https://github.com/threepointone)! - fix: hide `wrangler pages functions` in the main help menu

  This hides `wrangler pages functions` in the main help menu, since it's only intended for internal usage right now. It still "works", so nothing changes in that regard. We'll bring this back when we have a broader story in wrangler for functions.

- [#360](https://github.com/cloudflare/workers-sdk/pull/360) [`f590943`](https://github.com/cloudflare/workers-sdk/commit/f5909437a17954b4182823a14dfbc51b0433d971) Thanks [@threepointone](https://github.com/threepointone)! - fix: `kv:key get`

  The api for fetching a kv value, unlike every other cloudflare api, returns just the raw value as a string (as opposed to the `FetchResult`-style json). However, our fetch utility tries to convert every api response to json before parsing it further. This leads to bugs like https://github.com/cloudflare/workers-sdk/issues/359. The fix is to special case for `kv:key get`.

  Fixes https://github.com/cloudflare/workers-sdk/issues/359.

* [#373](https://github.com/cloudflare/workers-sdk/pull/373) [`6e7baf2`](https://github.com/cloudflare/workers-sdk/commit/6e7baf2afd7bdda3e15484086279d298a63abaa2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: use the appropriate package manager when initializing a wrangler project

  Previously, when we initialized a project using `wrangler init`, we always used npm as the package manager.

  Now we check to see whether npm and yarn are actually installed, and also whether there is already a lock file in place before choosing which package manager to use.

  Fixes #353

- [#363](https://github.com/cloudflare/workers-sdk/pull/363) [`0add2a6`](https://github.com/cloudflare/workers-sdk/commit/0add2a6a6d7d861e5a6047873a473d5156e8ca89) Thanks [@threepointone](https://github.com/threepointone)! - fix: support uppercase hotkeys in `wrangler dev`

  Just a quick fix to accept uppercase hotkeys during `dev`.

* [#331](https://github.com/cloudflare/workers-sdk/pull/331) [`e151223`](https://github.com/cloudflare/workers-sdk/commit/e1512230e8109afe905dd9bea46f638652906921) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: generate valid URL route paths for pages on Windows

  Previously route paths were manipulated by file-system path utilities.
  On Windows this resulted in URLs that had backslashes, which are invalid for such URLs.

  Fixes #51
  Closes #235
  Closes #330
  Closes #327

- [#338](https://github.com/cloudflare/workers-sdk/pull/338) [`e0d2f35`](https://github.com/cloudflare/workers-sdk/commit/e0d2f35542bc37636098a30469e93702dd7a0d35) Thanks [@threepointone](https://github.com/threepointone)! - feat: environments for Worker Sites

  This adds environments support for Workers Sites. Very simply, it uses a separate kv namespace that's indexed by the environment name. This PR also changes the name of the kv namespace generated to match Wrangler v1's implementation.

* [#329](https://github.com/cloudflare/workers-sdk/pull/329) [`e1d2198`](https://github.com/cloudflare/workers-sdk/commit/e1d2198b6454fead8a0115c2ed92a37b9def6dba) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - test: support testing in CI on Windows

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

- [#380](https://github.com/cloudflare/workers-sdk/pull/380) [`aacd1c2`](https://github.com/cloudflare/workers-sdk/commit/aacd1c2a4badb273878cda13fda56e4b21bdd9cd) Thanks [@GregBrimble](https://github.com/GregBrimble)! - refactor: clean up pages routing

* [#343](https://github.com/cloudflare/workers-sdk/pull/343) [`cfd8ba5`](https://github.com/cloudflare/workers-sdk/commit/cfd8ba5fa6b82968e5f8c5cce657e7c9eb468fc6) Thanks [@threepointone](https://github.com/threepointone)! - chore: update esbuild

  Update esbuild to 0.14.14. Also had to change `import esbuild from "esbuild";` to `import * as esbuild from "esbuild";` in `dev.tsx`.

- [#371](https://github.com/cloudflare/workers-sdk/pull/371) [`85ceb84`](https://github.com/cloudflare/workers-sdk/commit/85ceb84c474a20b191a475719196eed9674a8e77) Thanks [@nrgnrg](https://github.com/nrgnrg)! - fix: pages advanced mode usage

  Previously in pages projects using advanced mode (a single `_worker.js` or `--script-path` file rather than a `./functions` folder), calling `pages dev` would quit without an error and not launch miniflare.

  This change fixes that and enables `pages dev` to be used with pages projects in advanced mode.

* [#383](https://github.com/cloudflare/workers-sdk/pull/383) [`969c887`](https://github.com/cloudflare/workers-sdk/commit/969c887bfc371dc16d0827589ad21a68ea0b3a89) Thanks [@threepointone](https://github.com/threepointone)! - fix: remove redundant process.cwd() calls in `wrangler init`

  Followup from https://github.com/cloudflare/workers-sdk/pull/372#discussion_r798854509, just removing some unnecessary calls to `process.cwd()`/`path.join()`, since they're already relative to where they're called from.

- [#329](https://github.com/cloudflare/workers-sdk/pull/329) [`ac168f4`](https://github.com/cloudflare/workers-sdk/commit/ac168f4f62851ad3fe2e2705655baf8229c421ea) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: use helpers to manage npm commands

  This change speeds up tests and avoids us checking that npm did what it is supposed to do.

* [#348](https://github.com/cloudflare/workers-sdk/pull/348) [`b8e3b01`](https://github.com/cloudflare/workers-sdk/commit/b8e3b0124656ae3eb82fdebf1fcaaa056612ff1e) Thanks [@threepointone](https://github.com/threepointone)! - chore: replace `node-fetch` with `undici`

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

- [#357](https://github.com/cloudflare/workers-sdk/pull/357) [`41cfbc3`](https://github.com/cloudflare/workers-sdk/commit/41cfbc3b20fa79313c0a7236530c519876a05fc9) Thanks [@threepointone](https://github.com/threepointone)! - chore: add eslint-plugin-import

  - This adds `eslint-plugin-import` to enforce ordering of imports, and configuration for the same in `package.json`.
  - I also run `npm run check:lint -- --fix` to apply the configured order in our whole codebase.
  - This also needs a setting in `.vscode/settings.json` to prevent spurious warnings inside vscode. You'll probably have to restart your IDE for this to take effect. (re: https://github.com/import-js/eslint-plugin-import/issues/2377#issuecomment-1024800026)

  (I'd also like to enforce using `node:` prefixes for node builtin modules, but that can happen later. For now I manually added the prefixes wherever they were missing. It's not functionally any different, but imo it helps the visual grouping.)

* [#372](https://github.com/cloudflare/workers-sdk/pull/372) [`05dbb0d`](https://github.com/cloudflare/workers-sdk/commit/05dbb0d6f5d838b414ee84824f0f87571d18790f) Thanks [@threepointone](https://github.com/threepointone)! - feat: `wrangler init` offers to create a starter worker

  We got feedback that `wrangler init` felt incomplete, because the immediate next thing folks need is a starter source file. So this adds another step to `wrangler init` where we offer to create that file for you.

  Fixes https://github.com/cloudflare/workers-sdk/issues/355

- [#384](https://github.com/cloudflare/workers-sdk/pull/384) [`8452485`](https://github.com/cloudflare/workers-sdk/commit/84524850582dc25c99a76c314997eea37666ceb3) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: use xxhash-wasm for better compatibility with Windows

  The previous xxhash package we were using required a build step, which relied upon tooling that was not always available on Window.

  This version is a portable WASM package.

* [#334](https://github.com/cloudflare/workers-sdk/pull/334) [`536c7e5`](https://github.com/cloudflare/workers-sdk/commit/536c7e5e9472d876053d0d2405d045a2faf8e074) Thanks [@threepointone](https://github.com/threepointone)! - feat: wasm support for local mode in `wrangler dev`

  This adds support for `*.wasm` modules into local mode for `wrangler dev`.

  In 'edge' mode, we create a javascript bundle, but wasm modules are uploaded to the preview server directly when making the worker definition form upload. However, in 'local' mode, we need to have the actual modules available to the bundle. So we copy the files over to the bundle path. We also pass appropriate `--modules-rule` directive to `miniflare`.

  I also added a sample wasm app to use for testing, created from a default `workers-rs` project.

  Fixes https://github.com/cloudflare/workers-sdk/issues/299

- [#329](https://github.com/cloudflare/workers-sdk/pull/329) [`b8a3e78`](https://github.com/cloudflare/workers-sdk/commit/b8a3e785e4e4c348ff3495f2d0f9896e23a2b045) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - ci: use `npm ci` and do not cache workspace packages in node_modules

  Previously we were caching all the `node_modules` files in the CI jobs and then running `npm install`. While this resulted in slightly improved install times on Ubuntu, it breaks on Windows because the npm workspace setup adds symlinks into node_modules, which the Github cache action cannot cope with.

  This change removes the `node_modules` caches (saving some time by not needing to restore them) and replaces `npm install` with `npm ci`.

  The `npm ci` command is actually designed to be used in CI jobs as it only installs the exact versions specified in the `package-lock.json` file, guaranteeing that for any commit we always have exactly the same CI job run, deterministically.

  It turns out that, on Ubuntu, using `npm ci` makes very little difference to the installation time (~30 secs), especially if there is no `node_modules` there in the first place.

  Unfortunately, MacOS is slower (~1 min), and Windows even worse (~2 mins)! But it is worth this longer CI run to be sure we have things working on all OSes.

## 0.0.15

### Patch Changes

- [#333](https://github.com/cloudflare/workers-sdk/pull/333) [`6320a32`](https://github.com/cloudflare/workers-sdk/commit/6320a32fb867573b94403354d54ec7d5180304c4) Thanks [@threepointone](https://github.com/threepointone)! - fix: pass worker name to syncAssets in `dev`

  This fix passes the correct worker name to `syncAssets` during `wrangler dev`. This function uses the name to create the backing kv store for a Workers Sites definition, so it's important we get the name right.

  I also fixed the lint warning introduced in https://github.com/cloudflare/workers-sdk/pull/321, to pass `props.enableLocalPersistence` as a dependency in the `useEffect` call that starts the "local" mode dev server.

* [#335](https://github.com/cloudflare/workers-sdk/pull/335) [`a417cb0`](https://github.com/cloudflare/workers-sdk/commit/a417cb0ad40708755e55bd299e282e6862aa155d) Thanks [@threepointone](https://github.com/threepointone)! - fix: prevent infinite loop when fetching a list of results

  When fetching a list of results from cloudflare APIs (e.g. when fetching a list of keys in a kv namespace), the api returns a `cursor` that a consumer should use to get the next 'page' of results. It appears this cursor can also be a blank string (while we'd only account for it to be `undefined`). By only accounting for it to be `undefined`, we were infinitely looping through the same page of results and never terminating. This PR fixes it by letting it be a blank string (and `null`, for good measure)

- [#332](https://github.com/cloudflare/workers-sdk/pull/332) [`a2155c1`](https://github.com/cloudflare/workers-sdk/commit/a2155c1ec65e271e4a5be1a19717b1aebdd647a5) Thanks [@threepointone](https://github.com/threepointone)! - fix: wait for port to be available before creating a dev server

  When we run `wrangler dev`, we start a server on a port (defaulting to 8787). We do this separately for both local and edge modes. However, when switching between the two with the `l` hotkey, we don't 'wait' for the previous server to stop before starting the next one. This can crash the process, and we don't want that (of course). So we introduce a helper function `waitForPortToBeAvailable()` that waits for a port to be available before returning. This is used in both the local and edge modes, and prevents the bug right now, where switching between edge - local - edge crashes the process.

  (This isn't a complete fix, and we can still cause errors by very rapidly switching between the two modes. A proper long term fix for the future would probably be to hoist the proxy server hook above the `<Remote/>` and `<Local/>` components, and use a single instance throughout. But that requires a deeper refactor, and isn't critical at the moment.)

* [#336](https://github.com/cloudflare/workers-sdk/pull/336) [`ce61000`](https://github.com/cloudflare/workers-sdk/commit/ce6100066e0c20d010f5188402077e1bd1ab4005) Thanks [@threepointone](https://github.com/threepointone)! - feat: inline text-like files into the worker bundle

  We were adding text-like modules (i.e. `.txt`, `.html` and `.pem` files) as separate modules in the Worker definition, but this only really 'works' with the ES module Worker format. This commit changes that to inline the text-like files into the Worker bundle directly.

  We still have to do something similar with `.wasm` modules, but that requires a different fix, and we'll do so in a subsequent commit.

- [#336](https://github.com/cloudflare/workers-sdk/pull/336) [`ce61000`](https://github.com/cloudflare/workers-sdk/commit/ce6100066e0c20d010f5188402077e1bd1ab4005) Thanks [@threepointone](https://github.com/threepointone)! - feat: Sites support for local mode `wrangler dev`

  This adds support for Workers Sites in local mode when running wrangler `dev`. Further, it fixes a bug where we were sending the `__STATIC_CONTENT_MANIFEST` definition as a separate module even with service worker format, and a bug where we weren't uploading the namespace binding when other kv namespaces weren't present.

## 0.0.14

### Patch Changes

- [#307](https://github.com/cloudflare/workers-sdk/pull/307) [`53c6318`](https://github.com/cloudflare/workers-sdk/commit/53c6318739d2d3672a2e508f643857bdf5831676) Thanks [@threepointone](https://github.com/threepointone)! - feat: `wrangler secret * --local`

  This PR implements `wrangler secret` for `--local` mode. The implementation is simply a no-op, since we don't want to actually write secret values to disk (I think?). I also got the messaging for remote mode right by copying from Wrangler v1. Further, I added tests for all the `wrangler secret` commands.

* [#324](https://github.com/cloudflare/workers-sdk/pull/324) [`b816333`](https://github.com/cloudflare/workers-sdk/commit/b8163336faaeae26b68736732938cceaaf4dfec4) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Fixes `wrangler pages dev` failing to start for just a folder of static assets (no functions)

- [#317](https://github.com/cloudflare/workers-sdk/pull/317) [`d6ef61a`](https://github.com/cloudflare/workers-sdk/commit/d6ef61abcbc9f4b3a14222d99c9f02efa564e699) Thanks [@threepointone](https://github.com/threepointone)! - fix: restart the `dev` proxy server whenever it closes

  When we run `wrangler dev`, the session that we setup with the preview endpoint doesn't last forever, it dies after ignoring it for 5-15 minutes or so. The fix for this is to simply reconnect the server. So we use a state hook as a sigil, and add it to the dependency array of the effect that sets up the server, and simply change it every time the server closes.

  Fixes https://github.com/cloudflare/workers-sdk/issues/197

  (In Wrangler v1, we used to restart the whole process, including uploading the worker again, making a new preview token, and so on. It looks like that they may not have been necessary.)

* [#312](https://github.com/cloudflare/workers-sdk/pull/312) [`77aa324`](https://github.com/cloudflare/workers-sdk/commit/77aa3249ce07d7617582e4b0555201dac9b7578e) Thanks [@threepointone](https://github.com/threepointone)! - fix: remove `--prefer-offline` when running `npm install`

  We were using `--prefer-offline` when running `npm install` during `wrangler init`. The behaviour is odd, it doesn't seem to fetch from the remote when the cache isn't hit, which is not what I'm expecting. So we remove `--prefer-offline`.

- [#311](https://github.com/cloudflare/workers-sdk/pull/311) [`a5537f1`](https://github.com/cloudflare/workers-sdk/commit/a5537f147e61b046e141e06d1864ffa62e1f2673) Thanks [@threepointone](https://github.com/threepointone)! - fix: custom builds should allow multiple commands

  We were running custom builds as a regular command with `execa`. This would fail whenever we tried to run compound commands like `cargo install -q worker-build && worker-build --release` (via https://github.com/cloudflare/workers-sdk/issues/236). The fix is to use `shell: true`, so that the command is run in a shell and can thus use bash-y syntax like `&&`, and so on. I also switched to using `execaCommand` which splits a command string into parts correctly by itself.

* [#321](https://github.com/cloudflare/workers-sdk/pull/321) [`5b64a59`](https://github.com/cloudflare/workers-sdk/commit/5b64a5914ece57b2a76d2101d32abda5b8c5adb8) Thanks [@geelen](https://github.com/geelen)! - fix: disable local persistence by default & add `--experimental-enable-local-persistence` flag

  BREAKING CHANGE:

  When running `dev` locally any data stored in KV, Durable Objects or the cache are no longer persisted between sessions by default.

  To turn this back on add the `--experimental-enable-local-persistence` at the command line.

## 0.0.13

### Patch Changes

- [#293](https://github.com/cloudflare/workers-sdk/pull/293) [`71b0fab`](https://github.com/cloudflare/workers-sdk/commit/71b0fab02e4f65342b4b106f9dc3fa6a98db2a19) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: warn if the `site.entry-point` configuration is found during publishing

  Also updates the message and adds a test for the error when there is no entry-point specified.

  Fixes #282

* [#304](https://github.com/cloudflare/workers-sdk/pull/304) [`7477b52`](https://github.com/cloudflare/workers-sdk/commit/7477b52bd4b72b601b501564121fd4ee6a90aaef) Thanks [@threepointone](https://github.com/threepointone)! - feat: enhance `wrangler init`

  This PR adds some enhancements/fixes to the `wrangler init` command.

  - doesn't overwrite `wrangler.toml` if it already exists
  - installs `wrangler` when creating `package.json`
  - offers to install `wrangler` into `package.json` even if `package.json` already exists
  - offers to install `@cloudflare/workers-types` even if `tsconfig.json` already exists
  - pipes stdio back to the terminal so there's feedback when it's installing npm packages

  This does have the side effect of making out tests slower. I added `--prefer-offline` to the `npm install` calls to make this a shade quicker, but I can't figure out a good way of mocking these. I'll think about it some more later. We should work on making the installs themselves quicker (re: https://github.com/cloudflare/workers-sdk/issues/66)

  This PR also fixes a bug with our tests - `runWrangler` would catch thrown errors, and if we didn't manually verify the error, tests would pass. Instead, it now throws correctly, and I modified all the tests to assert on thrown errors. It seems like a lot, but it was just mechanical rewriting.

- [#294](https://github.com/cloudflare/workers-sdk/pull/294) [`7746fba`](https://github.com/cloudflare/workers-sdk/commit/7746fba6d36c2361851064f68eed5feb34dc8fbc) Thanks [@threepointone](https://github.com/threepointone)! - feature: add more types that get logged via `console` methods

  This PR adds more special logic for some data types that get logged via `console` methods. Types like `Promise`, `Date`, `WeakMaps`, and some more, now get logged correctly (or at least, better than they used to).

  This PR also fixes a sinister bug - the `type` of the `ConsoleAPICalled` events don't match 1:1 with actual console methods (eg: `console.warn` message type is `warning`). This PR adds a mapping between those types and method names. Some methods don't seem to have a message type, I'm not sure why, but we'll get to them later.

* [#310](https://github.com/cloudflare/workers-sdk/pull/310) [`52c99ee`](https://github.com/cloudflare/workers-sdk/commit/52c99ee74aab4db05d8e061dc4c205b1114e1bcc) Thanks [@threepointone](https://github.com/threepointone)! - feat: error if a site definition doesn't have a `bucket` field

  This adds an assertion error for making sure a `[site]` definition always has a `bucket` field.As a cleanup, I made some small fixes to the `Config` type definition, and modified the tests in `publish.test.ts` to use the config format when creating a `wrangler.toml` file.

## 0.0.12

### Patch Changes

- [#292](https://github.com/cloudflare/workers-sdk/pull/292) [`e5d3690`](https://github.com/cloudflare/workers-sdk/commit/e5d3690429cbf8945ba6f3c954a61b794bcfdea4) Thanks [@threepointone](https://github.com/threepointone)! - fix: use entrypoint specified in esbuuild's metafile as source for building the worker

  When we pass a non-js file as entry to esbuild, it generates a `.js` file. (which, is the whole job of esbuild, haha). So, given `<source>/index.ts`, it'll generate `<destination>/index.js`. However, when we try to 'find' the matching file to pass on as an input to creating the actual worker, we try to use the original file name inside the destination directory. At this point, the extension has changed, so it doesn't find the file, and hence we get the error that looks like `ENOENT: no such file or directory, open '/var/folders/3f/fwp6mt7n13bfnkd5vl3jmh1w0000gp/T/tmp-61545-4Y5kwyNI8DGU/src/worker.ts'`

  The actual path to the destination file is actually the key of the block in `metafile.outputs` that matches the given output.entryPoint, so this PR simply rewrites the logic to use that instead.

* [#287](https://github.com/cloudflare/workers-sdk/pull/287) [`b63efe6`](https://github.com/cloudflare/workers-sdk/commit/b63efe60646c8c955f4df4f2ce1d87ce9cc84ba3) Thanks [@threepointone](https://github.com/threepointone)! - fix: propagate api errors to the terminal correctly

  Any errors embedded in the response from the Cloudflare API were being lost, because `fetchInternal()` would throw on a non-200 response. This PR fixes that behaviour:

  - It doesn't throw on non-200 responses
  - It first gets the response text with `.text()` and converts it to an object with `JSON.parse`, so in case the api returns a non json response, we don't lose response we were sent.

  Unfortunately, because of the nature of this abstraction, we do lose the response `status` code and `statusText`, but maybe that's acceptable since we have richer error information in the payload. I considered logging the code and text to the terminal, but that may make it noisy.

## 0.0.11

### Patch Changes

- [#242](https://github.com/cloudflare/workers-sdk/pull/242) [`014a731`](https://github.com/cloudflare/workers-sdk/commit/014a731a72e062e9d6a2a4e0c4a7fcecd697b872) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Refactor pages code to pass strict-null checks

* [#267](https://github.com/cloudflare/workers-sdk/pull/267) [`e22f9d7`](https://github.com/cloudflare/workers-sdk/commit/e22f9d7c190e8c32e1121d15ea5581d919a5ef08) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: tidy up the typings of the build result in dev

  In #262 some of the strict null fixes were removed to resolve a regression.
  This refactor re-applies these fixes in a way that avoids that problem.

- [#284](https://github.com/cloudflare/workers-sdk/pull/284) [`20377e8`](https://github.com/cloudflare/workers-sdk/commit/20377e80d46d91560555c212a977b90308730c4d) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Add whoami command

* [#270](https://github.com/cloudflare/workers-sdk/pull/270) [`2453577`](https://github.com/cloudflare/workers-sdk/commit/2453577c96704ca1d6934582796199a409d7b770) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add support for include and exclude when publishing site assets

- [#270](https://github.com/cloudflare/workers-sdk/pull/270) [`0289882`](https://github.com/cloudflare/workers-sdk/commit/0289882a15eba55d802650a591f999ef7b614fb6) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure `kv:key list` matches the output from Wrangler v1

  The previous output was passing an array of objects to console.log, which ended up showing something like

  ```
  [Object object]
  [Object object]
  ...
  ```

  Now the result is JSON stringified before being sent to the console.
  The tests have been fixed to check this too.

* [#258](https://github.com/cloudflare/workers-sdk/pull/258) [`f9c1423`](https://github.com/cloudflare/workers-sdk/commit/f9c1423f0c5b6008f05b9657c9b84eb6f173563a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: correctly handle entry-point path when publishing

  The `publish` command was failing when the entry-point was specified in the wrangler.toml file and the entry-point imported another file.

  This was because we were using the `metafile.inputs` to guess the entry-point file path. But the order in which the source-files were added to this object was not well defined, and so we could end up failing to find a match.

  This fix avoids this by using the fact that the `metadata.outputs` object will only contain one element that has the `entrypoint` property - and then using that as the entry-point path. For runtime safety, we now assert that there cannot be zero or multiple such elements.

- [#275](https://github.com/cloudflare/workers-sdk/pull/275) [`e9ab55a`](https://github.com/cloudflare/workers-sdk/commit/e9ab55a106937e0a7909e54715ceb1fac9fce79e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add a link to create a github issue when there is an error.

  When a (non-yargs) error surfaces to the top level,
  we know also show a link to Github to encourage the developer to report an issue.

* [#286](https://github.com/cloudflare/workers-sdk/pull/286) [`b661dd0`](https://github.com/cloudflare/workers-sdk/commit/b661dd066887c11fe838d25c0530ef935a55a51a) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: Update `node-fetch` to 3.1.1, run `npm audit fix` in root

  This commit addresses a secutity issue in `node-fetch` and updates it to 3.1.1. I also ran `npm audit fix` in the root directory to address a similar issue with `@changesets/get-github-info`.

- [#249](https://github.com/cloudflare/workers-sdk/pull/249) [`9769bc3`](https://github.com/cloudflare/workers-sdk/commit/9769bc35243f7554b16153d9656750bb09c6f296) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Do not crash when processing environment configuration.

  Previously there were corner cases where the configuration might just crash.
  These are now handled more cleanly with more appropriate warnings.

* [#272](https://github.com/cloudflare/workers-sdk/pull/272) [`5fcef05`](https://github.com/cloudflare/workers-sdk/commit/5fcef05bbd8d046e29bbf61ab6aa84906ff077e1) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: enable TypeScript strict-null checks

  The codebase is now strict-null compliant and the CI checks will fail if a PR tries to introduce code that is not.

- [#277](https://github.com/cloudflare/workers-sdk/pull/277) [`6cc9dde`](https://github.com/cloudflare/workers-sdk/commit/6cc9dde6665978f5d6435b7d6d56d41d718693c5) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: align publishing sites asset keys with Wrangler v1

  - Use the same hashing strategy for asset keys (xxhash64)
  - Include the full path (from cwd) in the asset key
  - Match include and exclude patterns against full path (from cwd)
  - Validate that the asset key is not over 512 bytes long

* [#270](https://github.com/cloudflare/workers-sdk/pull/270) [`522d1a6`](https://github.com/cloudflare/workers-sdk/commit/522d1a6e4ec12d15148c48549dd074628cfd6824) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: check actual asset file size, not base64 encoded size

  Previously we were checking whether the base64 encoded size of an asset was too large (>25MiB).
  But base64 takes up more space than a normal file, so this was too aggressive.

- [#263](https://github.com/cloudflare/workers-sdk/pull/263) [`402c77d`](https://github.com/cloudflare/workers-sdk/commit/402c77d6be1dc7e797afb20893d2862c96f0343a) Thanks [@jkriss](https://github.com/jkriss)! - fix: appropriately fail silently when the open browser command doesn't work

* [#280](https://github.com/cloudflare/workers-sdk/pull/280) [`f19dde1`](https://github.com/cloudflare/workers-sdk/commit/f19dde1a7e71d13e9c249345b7affd1cfef79b2c) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: skip unwanted files and directories when publishing site assets

  In keeping with Wrangler v1, we now skip node_modules and hidden files and directories.

  An exception is made for `.well-known`. See https://datatracker.ietf.org/doc/html/rfc8615.

  The tests also prove that the asset uploader will walk directories in general.

- [#258](https://github.com/cloudflare/workers-sdk/pull/258) [`ba6fc9c`](https://github.com/cloudflare/workers-sdk/commit/ba6fc9c6ddbf3f5b7238f34087bc9533cdba2a5e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - chore: add test-watch script to the wrangler workspace

  Watch the files in the wrangler workspace, and run the tests when anything changes:

  ```sh
  > npm run test-watch -w wrangler
  ```

  This will also run all the tests in a single process (rather than in parallel shards) and will increase the test-timeout to 50 seconds, which is helpful when debugging.

## 0.0.10

### Patch Changes

- [#264](https://github.com/cloudflare/workers-sdk/pull/264) [`de73fa2`](https://github.com/cloudflare/workers-sdk/commit/de73fa2346737fb159910ac7a2d121671f9c4ea8) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to [`2.2.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.2.0)

## 0.0.9

### Patch Changes

- [#243](https://github.com/cloudflare/workers-sdk/pull/243) [`dc7ce83`](https://github.com/cloudflare/workers-sdk/commit/dc7ce831a29a69d8171ade84474c84f660667190) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: update test code to pass strict-null checks

* [#244](https://github.com/cloudflare/workers-sdk/pull/244) [`2e7a75f`](https://github.com/cloudflare/workers-sdk/commit/2e7a75f1bdd48514287a568ea7f802d7dbdf552e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: update dev and publish commands to pass strict-null checks

- [#246](https://github.com/cloudflare/workers-sdk/pull/246) [`e6733a3`](https://github.com/cloudflare/workers-sdk/commit/e6733a3abf2be1c7a6c18b65b412ccc8501fd3ba) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: upgrade `miniflare` to [`2.1.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.1.0)

* [#238](https://github.com/cloudflare/workers-sdk/pull/238) [`65f9904`](https://github.com/cloudflare/workers-sdk/commit/65f9904936a11dad8fef599242e0590bb5b7431a) Thanks [@threepointone](https://github.com/threepointone)! - refactor: simplify and document `config.ts`

  This PR cleans up the type definition for the configuration object, as well as commenting the hell out of it. There are no duplicate definitions, and I annotated what I could.

  - `@optional` means providing a value isn't mandatory
  - `@deprecated` means the field itself isn't necessary anymore in wrangler.toml
  - `@breaking` means the deprecation/optionality is a breaking change from Wrangler v1
  - `@todo` means there's more work to be done (with details attached)
  - `@inherited` means the field is copied to all environments

- [#247](https://github.com/cloudflare/workers-sdk/pull/247) [`edc4b53`](https://github.com/cloudflare/workers-sdk/commit/edc4b53c206373cb00470069f72846b56eb28427) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: update miscellaneous source files to pass strict-null checks

* [#248](https://github.com/cloudflare/workers-sdk/pull/248) [`5806932`](https://github.com/cloudflare/workers-sdk/commit/580693282f2c4c459add276143e53edfd057c677) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: update proxy code to pass strict-null checks

- [#241](https://github.com/cloudflare/workers-sdk/pull/241) [`5d423e9`](https://github.com/cloudflare/workers-sdk/commit/5d423e97136e9e9a1dfcc95d78f2b3a8ba56fd3f) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - chore: add common words to the cSpell config to prevent unwanted warnings

* [#257](https://github.com/cloudflare/workers-sdk/pull/257) [`00e51cd`](https://github.com/cloudflare/workers-sdk/commit/00e51cd5106dddd2af1c7cb99a6478e4fa3b276b) Thanks [@threepointone](https://github.com/threepointone)! - fix: description for `kv:bulk delete <filename>`

  The description for the `kv:bulk delete` command was wrong, it was probably copied earlier from the `kv:bulk put` command. This PR fixes the mistake.

- [#262](https://github.com/cloudflare/workers-sdk/pull/262) [`7494cf7`](https://github.com/cloudflare/workers-sdk/commit/7494cf7c18aa9f4454aca75f4d126d2ec976e736) Thanks [@threepointone](https://github.com/threepointone)! - fix: fix `dev` and `publish`

  We introduced some bugs in recent PRs

  - In https://github.com/cloudflare/workers-sdk/pull/196, we broke being able to pass an entrypoint directly to the cli. In this PR, I just reverted that fix. I'll reopen https://github.com/cloudflare/workers-sdk/issues/78 and we'll tackle it again later. (cc @jgentes)
  - In https://github.com/cloudflare/workers-sdk/pull/215, we broke being able to publish a script by just passing `--latest` or `--compatibility-data` in the cli. This PR fixes that by reading the correct argument when choosing whether to publish.
  - In https://github.com/cloudflare/workers-sdk/pull/247, we broke how we made requests by passing headers to requests. This PR reverts the changes made in `cfetch/internal.ts`. (cc @petebacondarwin)
  - In https://github.com/cloudflare/workers-sdk/pull/244, we broke `dev` and it would immediately crash. This PR fixes the reference in `dev.tsx` that was breaking. (cc @petebacondarwin)

* [#250](https://github.com/cloudflare/workers-sdk/pull/250) [`3c74a4a`](https://github.com/cloudflare/workers-sdk/commit/3c74a4a31d4c49c2d4221f59475337d81d26f0b7) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: update inspector code to ensure that strict-null types pass

## 0.0.8

### Patch Changes

- [#231](https://github.com/cloudflare/workers-sdk/pull/231) [`18f8f65`](https://github.com/cloudflare/workers-sdk/commit/18f8f65424adb8505c7584ae01b1823bb648eb6e) Thanks [@threepointone](https://github.com/threepointone)! - refactor: proxy/preview server

  This PR refactors how we setup the proxy server between the developer and the edge preview service during `wrangler dev`. Of note, we start the server immediately. We also buffer requests/streams and hold on to them, when starting/refreshing the token. This means a developer should never see `ERR_CONNECTION_REFUSED` error page, or have an older worker respond after making a change to the code. And when the token does get refreshed, we flush said streams/requests with the newer values, making the iteration process a lot smoother and predictable.

* [#239](https://github.com/cloudflare/workers-sdk/pull/239) [`0431093`](https://github.com/cloudflare/workers-sdk/commit/04310932118921d4566ccf6c803b9980dc986089) Thanks [@Warfields](https://github.com/Warfields)! - Added prompt for users to select an account.

- [#225](https://github.com/cloudflare/workers-sdk/pull/225) [`b901bf7`](https://github.com/cloudflare/workers-sdk/commit/b901bf76dee2220fb0349fca8d9250ea8e09fdb4) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Fix the `--watch` command for `wrangler pages functions build`.

* [#208](https://github.com/cloudflare/workers-sdk/pull/208) [`fe4b099`](https://github.com/cloudflare/workers-sdk/commit/fe4b0996eb446a94896fac4c7a4210ea5db52f11) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Remove explicit `any` types from the codebase

  This change removes all use of `any` from the code and updates the `no-explicit-any` eslint rule to be an error.

- [#223](https://github.com/cloudflare/workers-sdk/pull/223) [`a979d55`](https://github.com/cloudflare/workers-sdk/commit/a979d55feac1bdd340ec2b56710691837399183d) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Add ability to compile a directory other than `functions` for `wrangler pages functions build`.

* [#216](https://github.com/cloudflare/workers-sdk/pull/216) [`e1c615f`](https://github.com/cloudflare/workers-sdk/commit/e1c615f4e04c8d9d2dfa31fc0c5278d97c5dd663) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Ignore non-JS files when compiling Pages Functions

- [#217](https://github.com/cloudflare/workers-sdk/pull/217) [`777f4d5`](https://github.com/cloudflare/workers-sdk/commit/777f4d581a252f4b7f760816a00c3e8ae7b5a463) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Reverse execution order of Pages Functions middlewares

* [#221](https://github.com/cloudflare/workers-sdk/pull/221) [`8ff5537`](https://github.com/cloudflare/workers-sdk/commit/8ff55376ffb8f9db24d56fef6ee2c6bd5cc0527d) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to `2.0.0`

- [#196](https://github.com/cloudflare/workers-sdk/pull/196) [`fc112d7`](https://github.com/cloudflare/workers-sdk/commit/fc112d74fe212f32e585865df96999a894062801) Thanks [@jgentes](https://github.com/jgentes)! - allow specifying only "index" without extension or nothing at all for "wrangler dev" and "wrangler publish"

* [#211](https://github.com/cloudflare/workers-sdk/pull/211) [`3bbfd4f`](https://github.com/cloudflare/workers-sdk/commit/3bbfd4f7c207eb7dc903b843a53589d2fc3dea87) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Silently fail to auto-open the browser in `wrangler pages dev` command when that errors out.

- [#189](https://github.com/cloudflare/workers-sdk/pull/189) [`2f7e1b2`](https://github.com/cloudflare/workers-sdk/commit/2f7e1b21d229ea942bb0ee7dd46de3446576c604) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Refactor raw value extraction from Cloudflare APIs

  Most API responses are JSON of the form:

  ```
  { result, success, errors, messages, result_info }
  ```

  where the `result` contains the actual response value.

  But some API responses only contain the result value.

  This change refactors the client-side fetch API to allow callers to specify what kind of response they expect.

* [#202](https://github.com/cloudflare/workers-sdk/pull/202) [`e26781f`](https://github.com/cloudflare/workers-sdk/commit/e26781f9089b02425af56b8a7fe5c6770a457ffe) Thanks [@threepointone](https://github.com/threepointone)! - Disable @typescript-lint/no-explicit-any eslint rule in pages code

- [#214](https://github.com/cloudflare/workers-sdk/pull/214) [`79d0f2d`](https://github.com/cloudflare/workers-sdk/commit/79d0f2dc8ab416c15c5b1e73b6c6888ade8c848a) Thanks [@threepointone](https://github.com/threepointone)! - rename `--public` as `--experimental-public`

* [#215](https://github.com/cloudflare/workers-sdk/pull/215) [`41d4c3e`](https://github.com/cloudflare/workers-sdk/commit/41d4c3e0ae24f3edbe1ee510ec817f6aca528e6e) Thanks [@threepointone](https://github.com/threepointone)! - Add `--compatibility-date`, `--compatibility-flags`, `--latest` cli arguments to `dev` and `publish`.

  - A cli arg for adding a compatibility data, e.g `--compatibility_date 2022-01-05`
  - A shorthand `--latest` that sets `compatibility_date` to today's date. Usage of this flag logs a warning.
  - `latest` is NOT a config field in `wrangler.toml`.
  - In `dev`, when a compatibility date is not available in either `wrangler.toml` or as a cli arg, then we default to `--latest`.
  - In `publish` we error if a compatibility date is not available in either `wrangler.toml` or as a cli arg. Usage of `--latest` logs a warning.
  - We also accept compatibility flags via the cli, e.g: `--compatibility-flags formdata_parser_supports_files`

- [#210](https://github.com/cloudflare/workers-sdk/pull/210) [`d381fed`](https://github.com/cloudflare/workers-sdk/commit/d381fed8ff6c5450d0b2ed5a636e99bb874a5a3a) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Expose `wrangler pages functions build` command, which takes the `functions` folder and compiles it into a single Worker.

  This was already done in `wrangler pages dev`, so this change just exposes this build command for use in our build image, or for people who want to do it themselves.

* [#213](https://github.com/cloudflare/workers-sdk/pull/213) [`5e1222a`](https://github.com/cloudflare/workers-sdk/commit/5e1222a827792fbd4a7a48c73eedde5ffa476cf5) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Adds support for building a Worker from a folder of functions which isn't tied to the Pages platform.

  This lets developers use the same file-based routing system an simplified syntax when developing their own Workers!

- [#199](https://github.com/cloudflare/workers-sdk/pull/199) [`d9ecb70`](https://github.com/cloudflare/workers-sdk/commit/d9ecb7070ac692550497c8dfb3627e7badae4438) Thanks [@threepointone](https://github.com/threepointone)! - Refactor inspection/debugging code -

  - I've installed devtools-protocol, a convenient package that has the static types for the devtools protocol (duh) autogenerated from chrome's devtools codebase.
  - We now log messages and exceptions into the terminal directly, so you don't have to open devtools to see those messages.
  - Messages are now buffered until a devtools instance connects, so you won't lose any messages while devtools isn't connected.
  - We don't lose the connection on making changes to the worker, removing the need for the kludgy hack on the devtools side (where we refresh the whole page when there's a change)

* [#189](https://github.com/cloudflare/workers-sdk/pull/189) [`2f7e1b2`](https://github.com/cloudflare/workers-sdk/commit/2f7e1b21d229ea942bb0ee7dd46de3446576c604) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Fix pagination handling of list requests to the Cloudflare API

  When doing a list request to the API, the server may respond with only a single page of results.
  In this case, it will also provide a `cursor` value in the `result_info` part of the response, which can be used to request the next page.
  This change implements this on the client-side so that we get all the results by requesting further pages when there is a cursor.

- [#220](https://github.com/cloudflare/workers-sdk/pull/220) [`6fc2276`](https://github.com/cloudflare/workers-sdk/commit/6fc2276e9515da22fe05f267dc9cfef22b2f2793) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Add `--live-reload` option to `wrangler pages dev` which automatically reloads HTML pages when a change is detected

* [#223](https://github.com/cloudflare/workers-sdk/pull/223) [`a979d55`](https://github.com/cloudflare/workers-sdk/commit/a979d55feac1bdd340ec2b56710691837399183d) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Add `--output-config-path` option to `wrangler pages functions build` which writes a config file describing the `functions` folder.

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
- 1216fc9: Export regular functions from dialog.ts, pass tests (followup from https://github.com/cloudflare/workers-sdk/pull/124)
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
