# wrangler

## 2.0.6

### Patch Changes

- [#1018](https://github.com/cloudflare/wrangler2/pull/1018) [`cd2c42f`](https://github.com/cloudflare/wrangler2/commit/cd2c42fca02bff463d78398428dcf079a80e2ae6) Thanks [@threepointone](https://github.com/threepointone)! - fix: strip leading `*`/`*.` from routes when deducing a host for `dev`

  When given routes, we use the host name from the route to deduce a zone id to pass along with the host to set with dev `session`. Route patterns can include leading `*`/`*.`, which we don't account for when deducing said zone id, resulting in subtle errors for the session. This fix strips those leading characters as appropriate.

  Fixes https://github.com/cloudflare/wrangler2/issues/1002

* [#1044](https://github.com/cloudflare/wrangler2/pull/1044) [`7a191a2`](https://github.com/cloudflare/wrangler2/commit/7a191a2fd0cb08f2a80c29703a307286264ef74f) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: trim trailing whitespace from the secrets before uploading

  resolves #993

- [#1052](https://github.com/cloudflare/wrangler2/pull/1052) [`233eef2`](https://github.com/cloudflare/wrangler2/commit/233eef2081d093b08ec02e68445c5e9c26ebe58c) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: display the correct help information when a subcommand is invalid

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


  wrangler r2

  📦 Interact with an R2 store

  Commands:
    wrangler r2 bucket  Manage R2 buckets

  Flags:
    -c, --config   Path to .toml configuration file  [string]
    -h, --help     Show help  [boolean]
    -v, --version  Show version number  [boolean]
  ```

  Fixes #871

* [#906](https://github.com/cloudflare/wrangler2/pull/906) [`3279f10`](https://github.com/cloudflare/wrangler2/commit/3279f103fb3b1c27addb4c69c30ad970ab0d5f77) Thanks [@threepointone](https://github.com/threepointone)! - feat: implement support for service bindings

  This adds experimental support for service bindings, aka worker-to-worker bindings. It's lets you "call" a worker from another worker, without incurring any network cost, and (ideally) with much less latency. To use it, define a `[services]` field in `wrangler.toml`, which is a map of bindings to worker names (and environment). Let's say you already have a worker named "my-worker" deployed. In another worker's configuration, you can create a service binding to it like so:

  ```toml
  [[services]]
  binding = "MYWORKER"
  service = "my-worker"
  environment = "production" # optional, defaults to the worker's `default_environment` for now
  ```

  And in your worker, you can call it like so:

  ```js
  export default {
    fetch(req, env, ctx) {
      return env.MYWORKER.fetch(new Request("http://domain/some-path"));
    }
  };
  ```

  Fixes https://github.com/cloudflare/wrangler2/issues/1026

- [#1045](https://github.com/cloudflare/wrangler2/pull/1045) [`8eeef9a`](https://github.com/cloudflare/wrangler2/commit/8eeef9ace652ffad3be0116f6f58c71dc251e49c) Thanks [@jrf0110](https://github.com/jrf0110)! - fix: Incorrect extension extraction from file paths.

  Our extension extraction logic was taking into account folder names, which can include periods. The logic would incorrectly identify a file path of .well-known/foo as having the extension of well-known/foo when in reality it should be an empty string.

* [#1039](https://github.com/cloudflare/wrangler2/pull/1039) [`95852c3`](https://github.com/cloudflare/wrangler2/commit/95852c304716e8b9b97ef2a5486c8337cc278f1d) Thanks [@threepointone](https://github.com/threepointone)! - fix: don't fetch migrations when in `--dry-run` mode

  Fixes https://github.com/cloudflare/wrangler2/issues/1038

- [#1033](https://github.com/cloudflare/wrangler2/pull/1033) [`ffce3e3`](https://github.com/cloudflare/wrangler2/commit/ffce3e3fa1bf04a1597d4fd1c6ef5ed536b81308) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: `wrangler init` should not crash if Git is not available on Windows

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

* [#982](https://github.com/cloudflare/wrangler2/pull/982) [`6791703`](https://github.com/cloudflare/wrangler2/commit/6791703abc6f9e61a7f954db48d53c6994c80e03) Thanks [@matthewdavidrodgers](https://github.com/matthewdavidrodgers)! - feature: add support for publishing to Custom Domains

  With the release of Custom Domains for workers, users can publish directly to a custom domain on a route, rather than creating a dummy DNS record first and manually pointing the worker over - this adds the same support to wrangler.

  Users declare routes as normal, but to indicate that a route should be treated as a custom domain, a user simply uses the object format in the toml file, but with a new key: custom_domain (i.e. `routes = [{ pattern = "api.example.com", custom_domain = true }]`)

  When wrangler sees a route like this, it peels them off from the rest of the routes and publishes them separately, using the /domains api. This api is very defensive, erroring eagerly if there are conflicts in existing Custom Domains or managed DNS records. In the case of conflicts, wrangler prompts for confirmation, and then retries with parameters to indicate overriding is allowed.

- [#1019](https://github.com/cloudflare/wrangler2/pull/1019) [`5816eba`](https://github.com/cloudflare/wrangler2/commit/5816ebae462a5ec9252b9df1b46ace3204bc81e8) Thanks [@threepointone](https://github.com/threepointone)! - feat: bind a durable object by environment

  For durable objects, instead of just `{ name, class_name, script_name}`, this lets you bind by environment as well, like so `{ name, class_name, script_name, environment }`.

  Fixes https://github.com/cloudflare/wrangler2/issues/996

* [#1057](https://github.com/cloudflare/wrangler2/pull/1057) [`608dcd9`](https://github.com/cloudflare/wrangler2/commit/608dcd940ba2096d975dbbbedb63c34943617d4a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: pages "command" can consist of multiple words

  On Windows, the following command `wrangler pages dev -- foo bar` would error
  saying that `bar` was not a known argument. This is because `foo` and `bar` are
  passed to Yargs as separate arguments.

  A workaround is to put the command in quotes: `wrangler pages dev -- "foo bar"`.
  But this fix makes the `command` argument variadic, which also solves the problem.

  Fixes [#965](https://github.com/cloudflare/wrangler2/issues/965)

- [#1027](https://github.com/cloudflare/wrangler2/pull/1027) [`3545e41`](https://github.com/cloudflare/wrangler2/commit/3545e419a70f4f0d5dd305972bf63acf11f91d5c) Thanks [@rozenmd](https://github.com/rozenmd)! - feat: trying to use node builtins should recommend you enable node_compat in wrangler.toml

* [#1024](https://github.com/cloudflare/wrangler2/pull/1024) [`110f340`](https://github.com/cloudflare/wrangler2/commit/110f340061918026938cda2aba158276386fe6e9) Thanks [@threepointone](https://github.com/threepointone)! - polish: validate payload for `kv:bulk put` on client side

  This adds client side validation for the paylod for `kv:bulk put`, importantly ensuring we're uploading only string key/value pairs (as well as validation for the other fields).

  Fixes https://github.com/cloudflare/wrangler2/issues/571

- [#1037](https://github.com/cloudflare/wrangler2/pull/1037) [`963e9e0`](https://github.com/cloudflare/wrangler2/commit/963e9e08e52f7871923bded3fd5c2cb2ec452532) Thanks [@rozenmd](https://github.com/rozenmd)! - fix: don't attempt to login during a --dryRun

## 2.0.5

### Patch Changes

- [`556e6dd`](https://github.com/cloudflare/wrangler2/commit/556e6dda27b6800353fc709d02763cc47448198e) Thanks [@threepointone](https://github.com/threepointone)! - chore: bump to do a release

## 2.0.4

### Patch Changes

- [#987](https://github.com/cloudflare/wrangler2/pull/987) [`bb94038`](https://github.com/cloudflare/wrangler2/commit/bb94038b0f18306cf44ef598bd505e799d3c688e) Thanks [@threepointone](https://github.com/threepointone)! - fix: encode key when calling `kv:ket get`, don't encode when deleting a namespace

  This cleans up some logic from https://github.com/cloudflare/wrangler2/pull/964.

  - we shouldn't be encoding the id when deleting a namespace, since that'll already be an alphanumeric id
  - we should be encoding the key when we call kv:key get, or we get a similar issue as in https://github.com/cloudflare/wrangler2/issues/961
  - adds `KV` to all the KV-related function names
  - moves the api calls to `kv:namespace delete` and `kv:key delete` inside `kv.ts` helpers.

* [#980](https://github.com/cloudflare/wrangler2/pull/980) [`202f37d`](https://github.com/cloudflare/wrangler2/commit/202f37d99c8bff8f1031d7ff0910e9641357e3ac) Thanks [@threepointone](https://github.com/threepointone)! - fix: throw appropriate error when we detect an unsupported version of node

  When we start up the CLI, we check what the minimum version of supported node is, and throw an error if it isn't at least 16.7. However, the script that runs this, imports `node:child_process` and `node:path`, which was only introduced in 16.7. It was backported to older versions of node, but only in last updates to majors. So for example, if someone used 14.15.4, the script would throw because it wouldn't be able to find `node:child_process` (but it _would_ work on v14.19.2).

  The fix here is to not use the prefixed versions of these built-ins in the bootstrap script. Fixes https://github.com/cloudflare/wrangler2/issues/979

## 2.0.3

### Patch Changes

- [#956](https://github.com/cloudflare/wrangler2/pull/956) [`1caa5f7`](https://github.com/cloudflare/wrangler2/commit/1caa5f764100156a8d8e25347036b05e2b0210f6) Thanks [@threepointone](https://github.com/threepointone)! - fix: don't crash during `init` if `git` is not installed

  When a command isn't available on a system, calling `execa()` on it throws an error, and not just a non zero exitCode. This patch fixes the flow so we don't crash the whole process when that happens on testing the presence of `git` when calling `wrangler init`.

  Fixes https://github.com/cloudflare/wrangler2/issues/950

* [#970](https://github.com/cloudflare/wrangler2/pull/970) [`35e780b`](https://github.com/cloudflare/wrangler2/commit/35e780b0dddee81323963b2362c38261b65473c0) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Fixes Pages Plugins and static asset routing.

  There was previously a bug where a relative pathname would be missing the leading slash which would result in routing errors.

- [#957](https://github.com/cloudflare/wrangler2/pull/957) [`e0a0509`](https://github.com/cloudflare/wrangler2/commit/e0a05094493f1327b6790e66b6dcbff2d579628c) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - refactor: Moving `--legacy-env` out of global
  The `--legacy-env` flag was in global scope, which only certain commands
  utilize the flag for functionality, and doesnt do anything for the other commands.

  resolves #933

* [#948](https://github.com/cloudflare/wrangler2/pull/948) [`82165c5`](https://github.com/cloudflare/wrangler2/commit/82165c56a3d13bf466767e06500738bb97e61d6e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: improve error message if custom build output is not found

  The message you get if Wrangler cannot find the output from the custom build is now more helpful.
  It will even look around to see if there is a suitable file nearby and make suggestions about what should be put in the `main` configuration.

  Closes [#946](https://github.com/cloudflare/wrangler2/issues/946)

- [#952](https://github.com/cloudflare/wrangler2/pull/952) [`ae3895e`](https://github.com/cloudflare/wrangler2/commit/ae3895eea63518242b2660e6b52790f922566a78) Thanks [@d3lm](https://github.com/d3lm)! - feat: use host specific callback url

  To allow OAuth to work on environments such as WebContainer we have to generate a host-specific callback URL. This PR uses `@webcontainer/env` to generate such URL only for running in WebContainer. Otherwise the callback URL stays unmodified.

* [#951](https://github.com/cloudflare/wrangler2/pull/951) [`09196ec`](https://github.com/cloudflare/wrangler2/commit/09196ec6362fb8651d7d20bdc2a7a14792c6fda5) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: look for an alternate port in the dev command if the configured one is in use

  Previously, we were only calling `getPort()` if the configured port was undefined.
  But since we were setting the default for this during validation, it was never undefined.

  Fixes [#949](https://github.com/cloudflare/wrangler2/issues/949)

- [#963](https://github.com/cloudflare/wrangler2/pull/963) [`5b03eb8`](https://github.com/cloudflare/wrangler2/commit/5b03eb8cdec6f16c67a47f20472e098659395888) Thanks [@threepointone](https://github.com/threepointone)! - fix: work with Cloudflare WARP

  Using wrangler with Cloudflare WARP (https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/) requires using the Cloudflare certificate. This patch simply uses the certificate as NODE_EXTRA_CA_CERTS when we start wrangler.

  Test plan:

  - Turn on Cloudflare WARP/ Gateway with WARP
  - `wrangler dev`
  - Turn on Cloudflare WARP/ Gateway with DoH
  - `wrangler dev`
  - Turn off Cloudflare WARP
  - `wrangler dev`

  Fixes https://github.com/cloudflare/wrangler2/issues/953, https://github.com/cloudflare/wrangler2/issues/850

* [#964](https://github.com/cloudflare/wrangler2/pull/964) [`0dfd95f`](https://github.com/cloudflare/wrangler2/commit/0dfd95ff02ae72a34c8de6f5844a4208cb8fb7bf) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: KV not setting correctly
  The KV has URL inputs, which in the case of `/` would get collapsed and lost.
  T:o handle special characters `encodeURIComponent` is implemented.

  resolves #961

## 2.0.2

### Patch Changes

- [#947](https://github.com/cloudflare/wrangler2/pull/947) [`38b7242`](https://github.com/cloudflare/wrangler2/commit/38b7242621eb26fef9910ce4a161d26baff08d0a) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Updated defaults and help of wrangler pages publish

* [#941](https://github.com/cloudflare/wrangler2/pull/941) [`d84b568`](https://github.com/cloudflare/wrangler2/commit/d84b568818cf1ec4654aec806b27c40681df9c7b) Thanks [@threepointone](https://github.com/threepointone)! - fix: bundle worker as iife if detected as a service worker

  We detect whether a worker is a "modules" format worker by the presence of a `default` export. This is a pretty good heuristic overall, but sometimes folks can make mistakes. One situation that's popped up a few times, is people writing exports, but still writing it in "service worker" format. We detect this fine, and log a warning about the exports, but send it up with the exports included. Unfortunately, our runtime throws when we mark a worker as a service worker, but still has exports. This patch fixes it so that the exports are not included in a service-worker worker.

  Note that if you're missing an event listener, it'll still error with "No event handlers were registered. This script does nothing." but that's a better error than the SyntaxError _even when the listener was there_.

  Fixes https://github.com/cloudflare/wrangler2/issues/937

## 2.0.1

### Patch Changes

- [#932](https://github.com/cloudflare/wrangler2/pull/932) [`e95e5a0`](https://github.com/cloudflare/wrangler2/commit/e95e5a0a4e6848a747cba067ad7c095d672f0f55) Thanks [@threepointone](https://github.com/threepointone)! - fix: log proper response status codes in `dev`

  During `dev` we log the method/url/statuscode for every req+res. This fix logs the correct details for every request.

  Fixes https://github.com/cloudflare/wrangler2/issues/931

* [#930](https://github.com/cloudflare/wrangler2/pull/930) [`bc28bea`](https://github.com/cloudflare/wrangler2/commit/bc28bea376260abb6fed996698436fb11e7840fc) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Default to creating a new project when no existing ones are available for 'wrangler pages publish'

- [#934](https://github.com/cloudflare/wrangler2/pull/934) [`692ddc4`](https://github.com/cloudflare/wrangler2/commit/692ddc4f1a3770758a8199bbdcd0abee108c3a2c) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Suppress beta warning when operating in Pages' CI environment

* [#936](https://github.com/cloudflare/wrangler2/pull/936) [`a0e0b26`](https://github.com/cloudflare/wrangler2/commit/a0e0b2696f498e0d7913e8ffd3db5abd025e7085) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: support Windows line-endings in TOML files

  The TOML parser that Wrangler uses crashes if there is a Windows line-ending in a comment.
  See https://github.com/iarna/iarna-toml/issues/33.

  According to the TOML spec, we should be able to normalize line-endings as we see fit.
  See https://toml.io/en/v1.0.0#:~:text=normalize%20newline%20to%20whatever%20makes%20sense.

  This change normalizes line-endings of TOML strings before parsing to avoid hitting this bug.

  Fixes https://github.com/cloudflare/wrangler2/issues/915

## 2.0.0

### Major Changes

- [#928](https://github.com/cloudflare/wrangler2/pull/928) [`7672f99`](https://github.com/cloudflare/wrangler2/commit/7672f99b0d69b9bdcc149f54388b52f0f890f8f8) Thanks [@threepointone](https://github.com/threepointone)! - ⛅️ Wrangler 2.0.0

  Wrangler 2.0 is a full rewrite. Every feature has been improved, while retaining as much backward compatibility as we could. We hope you love it. It'll only get better.

## 0.0.34

### Patch Changes

- [#926](https://github.com/cloudflare/wrangler2/pull/926) [`7b38a7c`](https://github.com/cloudflare/wrangler2/commit/7b38a7c3e5df293167380002489c821c7c0a5553) Thanks [@threepointone](https://github.com/threepointone)! - polish: show paths of created files with `wrangler init`

  This patch modifies the terminal when running `wrangler init`, to show the proper paths of files created during it (like `package.json`, `tsconfig.json`, etc etc). It also fixes a bug where we weren't detecting the existence of `src/index.js` for a named worker before asking to create it.

## 0.0.33

### Patch Changes

- [#924](https://github.com/cloudflare/wrangler2/pull/924) [`3bdba63`](https://github.com/cloudflare/wrangler2/commit/3bdba63c49ad71a6d6d524751b0a05dc592fde59) Thanks [@threepointone](https://github.com/threepointone)! - fix: with`wrangler init`, test for existence of `package.json`/ `tsconfig.json` / `.git` in the right locations

  When running `wrangler.init`, we look for the existence of `package.json`, / `tsconfig.json` / `.git` when deciding whether we should create them ourselves or not. Because `name` can be a relative path, we had a bug where we don't starting look from the right directory. We also had a bug where we weren't even testing for the existence of the `.git` directory correctly. This patch fixes that initial starting location, tests for `.git` as a directory, and correctly decides when to create those files.

## 0.0.32

### Patch Changes

- [#922](https://github.com/cloudflare/wrangler2/pull/922) [`e2f9bb2`](https://github.com/cloudflare/wrangler2/commit/e2f9bb2bad7fcb64ad284da7dec5d91778c8a09b) Thanks [@threepointone](https://github.com/threepointone)! - feat: offer to create a git repo when calling `wrangler init`

  Worker projects created by `wrangler init` should also be managed by source control (popularly, git). This patch adds a choice in `wrangler init` to make the created project into a git repository.

  Additionally, this fixes a bug in our tests where mocked `confirm()` and `prompt()` calls were leaking between tests.

  Closes https://github.com/cloudflare/wrangler2/issues/847

## 0.0.31

### Patch Changes

- [#916](https://github.com/cloudflare/wrangler2/pull/916) [`4ef5fbb`](https://github.com/cloudflare/wrangler2/commit/4ef5fbbb2866de403cb613b742ef2042d12feebd) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: display and error and help for `wrangler init --site`

  The `--site` option is no longer supported.
  This change adds information about how to create a new Sites project
  by cloning a repository.
  It also adds links to the Worker Sites and Cloudflare Pages docs.

* [#908](https://github.com/cloudflare/wrangler2/pull/908) [`f8dd31e`](https://github.com/cloudflare/wrangler2/commit/f8dd31e322774180b371c6af15b4bfbd92a58284) Thanks [@threepointone](https://github.com/threepointone)! - fix: fix isolate prewarm logic for `wrangler dev`

  When calling `wrangler dev`, we make a request to a special URL that "prewarms" the isolate running our Worker so that we can attach devtools etc to it before actually making a request. We'd implemented it wrongly, and because we'd silenced its errors, we weren't catching it. This patch fixes the logic (based on wrangler 1.x's implementation) and enables logging errors when the prewarm request fails.

  As a result, profiling starts working again as expected. Fixes https://github.com/cloudflare/wrangler2/issues/907

- [#919](https://github.com/cloudflare/wrangler2/pull/919) [`13078e1`](https://github.com/cloudflare/wrangler2/commit/13078e147f49c5054fc87dc4ab5a5f2028b93f5a) Thanks [@threepointone](https://github.com/threepointone)! - fix: don't crash when tail event is null

  Sometime the "event" on a tail can be null. This patch makes sure we don't crash when that happens. Fixes https://github.com/cloudflare/wrangler2/issues/918

* [#913](https://github.com/cloudflare/wrangler2/pull/913) [`dfeed74`](https://github.com/cloudflare/wrangler2/commit/dfeed74ee4c07d1e3c2e1b91ad5ccaa68fc9c120) Thanks [@threepointone](https://github.com/threepointone)! - polish: add a deprecation warning to `--inspect` on `dev`

  We have a blogposts and docs that says you need to pass `--inspect` to use devtools and/or profile your Worker. In wrangler v2, we don't need to pass the flag anymore. Using it right now will throw an error, so this patch makes it a simple warning instead.

- [#916](https://github.com/cloudflare/wrangler2/pull/916) [`4ef5fbb`](https://github.com/cloudflare/wrangler2/commit/4ef5fbbb2866de403cb613b742ef2042d12feebd) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add some space after the CLI help message when there is an error

* [#920](https://github.com/cloudflare/wrangler2/pull/920) [`57cf221`](https://github.com/cloudflare/wrangler2/commit/57cf221179661a5a6dd448086cdd019fac55e822) Thanks [@threepointone](https://github.com/threepointone)! - chore: don't minify bundles

  When errors in wrangler happen, it's hard to tell where the error is coming from in a minified bundle. This patch removes the minification. We still set `process.env.NODE_ENV = 'production'` in the bundle so we don't run dev-only paths in things like React.

  This adds about 2 mb to the bundle, but imo it's worth it.

- [#916](https://github.com/cloudflare/wrangler2/pull/916) [`4ef5fbb`](https://github.com/cloudflare/wrangler2/commit/4ef5fbbb2866de403cb613b742ef2042d12feebd) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: update the `generate` command to provide better deprecation messaging

* [#914](https://github.com/cloudflare/wrangler2/pull/914) [`9903526`](https://github.com/cloudflare/wrangler2/commit/9903526d03891dadfbe0d75dd21dcc0e118f9f73) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - fix: Ensure getting git branch doesn't fail on Windows

- [#917](https://github.com/cloudflare/wrangler2/pull/917) [`94d3d6d`](https://github.com/cloudflare/wrangler2/commit/94d3d6d3efa525f31b1c519067cce9f88fb8490b) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Hit correct endpoint for 'wrangler pages publish'

* [#910](https://github.com/cloudflare/wrangler2/pull/910) [`fe0344d`](https://github.com/cloudflare/wrangler2/commit/fe0344d894fa65a623966710914ef21f542341e1) Thanks [@taylorlee](https://github.com/taylorlee)! - fix: support preview buckets for r2 bindings

  Allows wrangler2 to perform preview & dev sessions with a different bucket than the published worker's binding.

  This matches kv's preview_id behavior, and brings the wrangler2 implementation in sync with wrangler1.

## 0.0.30

### Patch Changes

- [#902](https://github.com/cloudflare/wrangler2/pull/902) [`daed3c3`](https://github.com/cloudflare/wrangler2/commit/daed3c3d09c7416ef46a8f12e9c2c1ec9ff5cbd3) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: show error if a string option is used without a value

  Fixes #883

* [#901](https://github.com/cloudflare/wrangler2/pull/901) [`b246066`](https://github.com/cloudflare/wrangler2/commit/b24606696a18bb2183072b9a1e0e0dc57371791c) Thanks [@threepointone](https://github.com/threepointone)! - chore: minify bundle, don't ship sourcemaps

  We haven't found much use for sourcemaps in production, and we should probably minify the bundle anyway. This will also remove an dev only warnings react used to log.

- [#904](https://github.com/cloudflare/wrangler2/pull/904) [`641cdad`](https://github.com/cloudflare/wrangler2/commit/641cdadb5168af7b5be042ccc394ddf501e8475d) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Adds 'assets:' loader for Pages Functions.

  This lets users and Plugin authors include a folder of static assets in Pages Functions.

  ```ts
  export { onRequest } from "assets:../folder/of/static/assets";
  ```

  More information in [our docs](https://developers.cloudflare.com/pages/platform/functions/plugins/).

* [#905](https://github.com/cloudflare/wrangler2/pull/905) [`c57ff0e`](https://github.com/cloudflare/wrangler2/commit/c57ff0e3fdd8c13156e6f9973fba30da56694ce2) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - chore: removed Sentry and related reporting code. Automated reporting of Wrangler errors will be reimplemented after further planning.

## 0.0.29

### Patch Changes

- [#897](https://github.com/cloudflare/wrangler2/pull/897) [`d0801b7`](https://github.com/cloudflare/wrangler2/commit/d0801b77c3d10526041e1962679b2fd2283a8ac4) Thanks [@threepointone](https://github.com/threepointone)! - polish: tweak the message when `.dev.vars` is used

  This tweaks the mssage when a `.dev.vars` file is used so that it doesn't imply that the user has to copy the values from it into their `wrangler.toml`.

* [#880](https://github.com/cloudflare/wrangler2/pull/880) [`aad1418`](https://github.com/cloudflare/wrangler2/commit/aad1418a388edddc2096c20b48fb37cdff7c51ff) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Stop unnecessarily amalgamating duplicate headers in Pages Functions

  Previously, `set-cookie` multiple headers would be combined because of unexpected behavior in [the spec](https://github.com/whatwg/fetch/pull/1346).

- [#892](https://github.com/cloudflare/wrangler2/pull/892) [`b08676a`](https://github.com/cloudflare/wrangler2/commit/b08676a64df933eeb38439a6e7a5094b4d3c34f7) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Adds the leading slash to Pages deployment manifests that the API expects, and fixes manifest generation on Windows machines.

* [#852](https://github.com/cloudflare/wrangler2/pull/852) [`6283ad5`](https://github.com/cloudflare/wrangler2/commit/6283ad54bf77547b6fbb49cababb996bccadfd6e) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: non-TTY check for required variables
  Added a check in non-TTY environments for `account_id`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. If `account_id` exists in `wrangler.toml`
  then `CLOUDFLARE_ACCOUNT_ID` is not needed in non-TTY scope. The `CLOUDFLARE_API_TOKEN` is necessary in non-TTY scope and will always error if missing.

  resolves #827

- [#893](https://github.com/cloudflare/wrangler2/pull/893) [`5bf17ca`](https://github.com/cloudflare/wrangler2/commit/5bf17ca81fd9627f4f7486607b1283aab2da30fe) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: remove bold font from additional lines of warnings and errors

  Previously, when a warning or error was logged, the entire message
  was formatted in bold font. This change makes only the first line of
  the message bold, and the rest is formatted with a normal font.

* [#894](https://github.com/cloudflare/wrangler2/pull/894) [`57c1354`](https://github.com/cloudflare/wrangler2/commit/57c1354f92a9f4bf400120d5c607a5838febca76) Thanks [@threepointone](https://github.com/threepointone)! - polish: s/DO NOT USE THIS/ Ignored

  Followup to https://github.com/cloudflare/wrangler2/pull/888, this replaces some more scary capitals with a more chill word.

- [#893](https://github.com/cloudflare/wrangler2/pull/893) [`5bf17ca`](https://github.com/cloudflare/wrangler2/commit/5bf17ca81fd9627f4f7486607b1283aab2da30fe) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add bold to the `Deprecated` warning title

* [#882](https://github.com/cloudflare/wrangler2/pull/882) [`1ad7570`](https://github.com/cloudflare/wrangler2/commit/1ad757026814cebab67910a136d7be5c95c7bae6) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add support for reading build time env variables from a `.env` file

  This change will automatically load up a `.env` file, if found, and apply its
  values to the current environment. An example would be to provide a specific
  CLOUDFLARE_ACCOUNT_ID value.

  Related to cloudflare#190

- [#887](https://github.com/cloudflare/wrangler2/pull/887) [`2bb4d30`](https://github.com/cloudflare/wrangler2/commit/2bb4d30e0c50ec1c3d9d821c768fc711e8be4ca9) Thanks [@threepointone](https://github.com/threepointone)! - polish: accept Enter as a valid key in confirm dialogs

  Instead of logging "Unrecognised input" when hitting return/enter in a confirm dialog, we should accept it as a confirmation. This patch also makes the default choice "y" bold in the dialog.

* [#891](https://github.com/cloudflare/wrangler2/pull/891) [`bae5ba4`](https://github.com/cloudflare/wrangler2/commit/bae5ba451811f7ec37f7355463aab9163b4299f8) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Adds interactive prompts for the 'wrangler pages publish' and related commands.

  Additionally, those commands now read from `node_modules/.cache/wrangler/pages.json` to persist users' account IDs and project names.

- [#888](https://github.com/cloudflare/wrangler2/pull/888) [`b77aa38`](https://github.com/cloudflare/wrangler2/commit/b77aa38e01d743d05f3f6e79a5786fb46bbdafc4) Thanks [@threepointone](https://github.com/threepointone)! - polish: s/DEPRECATION/Deprecation

  This removes the scary uppercase from DEPRECATION warnings. It also moves the service environment usage warning into `diagnostics` instead of logging it directly.

* [#879](https://github.com/cloudflare/wrangler2/pull/879) [`f694313`](https://github.com/cloudflare/wrangler2/commit/f6943132a04f17af68e2070756d1ec2aa2bdf0be) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: read `vars` overrides from a local file for `wrangler dev`

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

- [#843](https://github.com/cloudflare/wrangler2/pull/843) [`da12cc5`](https://github.com/cloudflare/wrangler2/commit/da12cc55a571eb30480fb21324002f682137b836) Thanks [@threepointone](https://github.com/threepointone)! - fix: `site.entry-point` is no longer a hard deprecation

  To make migration of v1 projects easier, Sites projects should still work, including the `entry-point` field (which currently errors out). This enables `site.entry-point` as a valid entry point, with a deprecation warning.

* [#848](https://github.com/cloudflare/wrangler2/pull/848) [`0a79d75`](https://github.com/cloudflare/wrangler2/commit/0a79d75e6aba11a3f0d5a7490f1b75c9f3e80ea8) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - polish: improve consistency of warnings and errors

  Related to #377

- [#877](https://github.com/cloudflare/wrangler2/pull/877) [`97f945f`](https://github.com/cloudflare/wrangler2/commit/97f945fd3544eaba3f6bc4df2e5487049ea32817) Thanks [@caass](https://github.com/caass)! - Treat the "name" parameter in `wrangler init` as a path.

  This means that running `wrangler init .` will create a worker in the current directory,
  and the worker's name will be the name of the current directory.

  You can also run `wrangler init path/to/my-worker` and a worker will be created at
  `[CWD]/path/to/my-worker` with the name `my-worker`,

* [#851](https://github.com/cloudflare/wrangler2/pull/851) [`277b254`](https://github.com/cloudflare/wrangler2/commit/277b25421175b4efc803cd68ef543cb55b07c114) Thanks [@threepointone](https://github.com/threepointone)! - polish: do not log the error object when refreshing a token fails

  We handle the error anyway (by doing a fresh login) which has its own logging and messaging. In the future we should add a DEBUG mode that logs all requests/errors/warnings, but that's for later.

- [#869](https://github.com/cloudflare/wrangler2/pull/869) [`f1423bf`](https://github.com/cloudflare/wrangler2/commit/f1423bf6399655d5c186c4849f23bb2196e4fcec) Thanks [@threepointone](https://github.com/threepointone)! - feat: experimental `--node-compat` / `config.node_compat`

  This adds an experimental node.js compatibility mode. It can be enabled by adding `node_compat = true` in `wrangler.toml`, or by passing `--node-compat` as a command line arg for `dev`/`publish` commands. This is currently powered by `@esbuild-plugins/node-globals-polyfill` (which in itself is powered by `rollup-plugin-node-polyfills`).

  We'd previously added this, and then removed it because the quality of the polyfills isn't great. We're reintroducing it regardless so we can start getting feedback on its usage, and it sets up a foundation for replacing it with our own, hopefully better maintained polyfills.

  Of particular note, this means that what we promised in https://blog.cloudflare.com/announcing-stripe-support-in-workers/ now actually works.

  This patch also addresses some dependency issues, specifically leftover entries in package-lock.json.

* [#790](https://github.com/cloudflare/wrangler2/pull/790) [`331c659`](https://github.com/cloudflare/wrangler2/commit/331c65979295320b37cbf1f995f4acfc28630702) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - feature: Adds 'wrangler pages publish' (alias 'wrangler pages deployment create') command.

- [#866](https://github.com/cloudflare/wrangler2/pull/866) [`8b227fc`](https://github.com/cloudflare/wrangler2/commit/8b227fc97e50abe36651b4a6c029b9ada404dc1f) Thanks [@caass](https://github.com/caass)! - Add a runtime check for `wrangler dev` local mode to avoid erroring in environments with no `AsyncLocalStorage` class

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

* [#829](https://github.com/cloudflare/wrangler2/pull/829) [`f08aac5`](https://github.com/cloudflare/wrangler2/commit/f08aac5dc1894ceaa84fc8b1a0c3d898dbbbe028) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: Add validation to the `name` field in configuration.
  The validation will warn users that the field can only be "type string,
  alphanumeric, underscores, and lowercase with dashes only" using the same RegEx as the backend

  resolves #795 #775

- [#868](https://github.com/cloudflare/wrangler2/pull/868) [`6ecb1c1`](https://github.com/cloudflare/wrangler2/commit/6ecb1c128bde5c8f8d7403278f07cc0e991c16a0) Thanks [@threepointone](https://github.com/threepointone)! - feat: implement service environments + durable objects

  Now that the APIs for getting migrations tags of services works as expected, this lands support for publishing durable objects to service environments, including migrations. It also removes the error we used to throw when attempting to use service envs + durable objects.

  Fixes https://github.com/cloudflare/wrangler2/issues/739

## 0.0.27

### Patch Changes

- [#838](https://github.com/cloudflare/wrangler2/pull/838) [`9c025c4`](https://github.com/cloudflare/wrangler2/commit/9c025c41b89e744e2d1a228baf6d24a0e7defe55) Thanks [@threepointone](https://github.com/threepointone)! - fix: remove timeout on custom builds, and make sure logs are visible

  This removes the timeout we have for custom builds. We shouldn't be applying this timeout anyway, since it doesn't block wrangler, just the user themselves. Further, in https://github.com/cloudflare/wrangler2/pull/759, we changed the custom build's process stdout/stderr config to "pipe" to pass tests, however that meant we wouldn't see logs in the terminal anymore. This patch removes the timeout, and brings back proper logging for custom builds.

* [#349](https://github.com/cloudflare/wrangler2/pull/349) [`9d04a68`](https://github.com/cloudflare/wrangler2/commit/9d04a6866099e77a93a50dfd33d6e7707e4d9e9c) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: rename `--script-path` to `--outfile` for `wrangler pages functions build` command.

- [#836](https://github.com/cloudflare/wrangler2/pull/836) [`28e3b17`](https://github.com/cloudflare/wrangler2/commit/28e3b1756009df462b6f25c1fb1b0fa567e7ca67) Thanks [@threepointone](https://github.com/threepointone)! - fix: toggle `workers.dev` subdomains only when required

  This fix -

  - passes the correct query param to check whether a workers.dev subdomain has already been published/enabled
  - thus enabling it only when it's not been enabled
  - it also disables it only when it's explicitly knows it's already been enabled

  The effect of this is that publishes are much faster.

* [#794](https://github.com/cloudflare/wrangler2/pull/794) [`ee3475f`](https://github.com/cloudflare/wrangler2/commit/ee3475fc4204335f3659e9a045524e8dc9dc6b2c) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: Error messaging from failed login would dump a `JSON.parse` error in some situations. Added a fallback if `.json` fails to parse
  it will attempt `.text()` then throw result. If both attempts to parse fail it will throw an `UnknownError` with a message showing where
  it originated.

  resolves #539

- [#840](https://github.com/cloudflare/wrangler2/pull/840) [`32f6108`](https://github.com/cloudflare/wrangler2/commit/32f6108a6427e542d45bd14f85e2f2d4e4a79f1c) Thanks [@threepointone](https://github.com/threepointone)! - fix: make wrangler work on node v18

  There's some interference between our data fetching library `undici` and node 18's new `fetch` and co. (powered by `undici` internally) which replaces the filename of `File`s attached to `FormData`s with a generic `blob` (likely this code - https://github.com/nodejs/undici/blob/615f6170f4bd39630224c038d1ea5bf505d292af/lib/fetch/formdata.js#L246-L250). It's still not clear why it does so, and it's hard to make an isolated example of this.

  Regardless, disabling the new `fetch` functionality makes `undici` use its own base classes, avoiding the problem for now, and unblocking our release. We'll keep investigating and look for a proper fix.

  Unblocks https://github.com/cloudflare/wrangler2/issues/834

* [#824](https://github.com/cloudflare/wrangler2/pull/824) [`62af4b6`](https://github.com/cloudflare/wrangler2/commit/62af4b6603f56a046e00688c94a0fe8d760891a3) Thanks [@threepointone](https://github.com/threepointone)! - feat: `publish --dry-run`

  It can be useful to do a dry run of publishing. Developers want peace of mind that a project will compile before actually publishing to live servers. Combined with `--outdir`, this is also useful for testing the output of `publish`. Further, it gives developers a chance to upload our generated sourcemap to a service like sentry etc, so that errors from the worker can be mapped against actual source code, but before the service actually goes live.

- [#798](https://github.com/cloudflare/wrangler2/pull/798) [`feecc18`](https://github.com/cloudflare/wrangler2/commit/feecc18b1bfec271dc595cba0c57ee6af8213af3) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Allows `next()` to take just a pathname with Pages Functions.

* [#839](https://github.com/cloudflare/wrangler2/pull/839) [`f2d6de6`](https://github.com/cloudflare/wrangler2/commit/f2d6de6364b42305f70c40058155a0aecab5c2a5) Thanks [@threepointone](https://github.com/threepointone)! - fix: persist dev experimental storage state in feature specific dirs

  With `--experimental-enable-local-persistence` in `dev`, we were clobbering a single folder with data from kv/do/cache. This patch gives individual folders for them. It also enables persistence even when this is not true, but that stays only for the length of a session, and cleans itself up when the dev session ends.

  Fixes https://github.com/cloudflare/wrangler2/issues/830

- [#820](https://github.com/cloudflare/wrangler2/pull/820) [`60c409a`](https://github.com/cloudflare/wrangler2/commit/60c409a9478ae0ab51a40da0c7c9fa0d9a5917ca) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: display a warning if the user has a `miniflare` section in their `wrangler.toml`.

  Closes #799

* [#796](https://github.com/cloudflare/wrangler2/pull/796) [`3e0db3b`](https://github.com/cloudflare/wrangler2/commit/3e0db3baf6f6a3eb5b4b947e1a2fb46cbd5a7095) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Makes Response Headers object mutable after a call to `next()` in Pages Functions

- [#814](https://github.com/cloudflare/wrangler2/pull/814) [`51fea7c`](https://github.com/cloudflare/wrangler2/commit/51fea7c53bc17f43c8674044517bdbff6b77188f) Thanks [@threepointone](https://github.com/threepointone)! - fix: disallow setting account_id in named service environments

  Much like https://github.com/cloudflare/wrangler2/pull/641, we don't want to allow setting account_id with named service environments. This is so that we use the same account_id for multiple environments, and have them group together in the dashboard.

* [#823](https://github.com/cloudflare/wrangler2/pull/823) [`4a00910`](https://github.com/cloudflare/wrangler2/commit/4a00910f2c689620566d650cb0f1709d72cc0dcd) Thanks [@threepointone](https://github.com/threepointone)! - fix: don't log an error when `wrangler dev` is cancelled early

  We currently log an `AbortError` with a stack if we exit `wrangler dev`'s startup process before it's done. This fix skips logging that error (since it's not an exception).

  Test plan:

  ```
  cd packages/wrangler
  npm run build
  cd ../../examples/workers-chat-demo
  npx wrangler dev
  # hit [x] as soon as the hotkey shortcut bar shows
  ```

- [#815](https://github.com/cloudflare/wrangler2/pull/815) [`025c722`](https://github.com/cloudflare/wrangler2/commit/025c722b30005c701c459327b86a63ac05e0f59b) Thanks [@threepointone](https://github.com/threepointone)! - fix: ensure that bundle is generated to es2020 target

  The default tsconfig generated by tsc uses `target: "es5"`, which we don't support. This fix ensures that we output es2020 modules, even if tsconfig asks otherwise.

* [#349](https://github.com/cloudflare/wrangler2/pull/349) [`9d04a68`](https://github.com/cloudflare/wrangler2/commit/9d04a6866099e77a93a50dfd33d6e7707e4d9e9c) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feature: Adds a `--plugin` option to `wrangler pages functions build` which compiles a Pages Plugin. More information about Pages Plugins can be found [here](https://developers.cloudflare.com/pages/platform/functions/plugins/). This wrangler build is required for both the development of, and inclusion of, plugins.

- [#822](https://github.com/cloudflare/wrangler2/pull/822) [`4302172`](https://github.com/cloudflare/wrangler2/commit/43021725380a1c914c93774ad5251580ee13d730) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Add help messages for `wrangler pages project` and `wrangler pages deployment`

* [#837](https://github.com/cloudflare/wrangler2/pull/837) [`206b9a5`](https://github.com/cloudflare/wrangler2/commit/206b9a5ac93eddc9b26ad18438258e1f68fbdd91) Thanks [@threepointone](https://github.com/threepointone)! - polish: replace 🦺 with ⚠️

  I got some feedback that the construction worker jacket (?) icon for deprecations is confusing, especially because it's an uncommon icon and not very big in the terminal. This patch replaces it with a more familiar warning symbol.

- [#824](https://github.com/cloudflare/wrangler2/pull/824) [`62af4b6`](https://github.com/cloudflare/wrangler2/commit/62af4b6603f56a046e00688c94a0fe8d760891a3) Thanks [@threepointone](https://github.com/threepointone)! - feat: `publish --outdir <path>`

  It can be useful to introspect built assets. A leading usecase is to upload the sourcemap that we generate to services like sentry etc, so that errors from the worker can be mapped against actual source code. We introduce a `--outdir` cli arg to specify a path to generate built assets at, which doesn't get cleaned up after publishing. We are _not_ adding this to `wrangler.toml` just yet, but could in the future if it looks appropriate there.

* [#811](https://github.com/cloudflare/wrangler2/pull/811) [`8c2c7b7`](https://github.com/cloudflare/wrangler2/commit/8c2c7b738cb7519c3b0e10d1c2a138db74342c7a) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: Added `minify` as a configuration option and a cli arg, which will minify code for `dev` and `publish`

  resolves #785

## 0.0.26

### Patch Changes

- [#782](https://github.com/cloudflare/wrangler2/pull/782) [`34552d9`](https://github.com/cloudflare/wrangler2/commit/34552d94fb41b7e119fd39bd26fb77568866ecaa) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feature: Add 'pages create project [name]' command.

  This command will create a Pages project with a given name, and optionally set its `--production-branch=[production]`.

* [#772](https://github.com/cloudflare/wrangler2/pull/772) [`a852e32`](https://github.com/cloudflare/wrangler2/commit/a852e329d9f3df1da24ed9a5b617ff9cae2ebcde) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: We want to prevent any user created code from sending Events to Sentry,
  which can be captured by `uncaughtExceptionMonitor` listener.
  Miniflare code can run user code on the same process as Wrangler,
  so we want to return `null` if `@miniflare` is present in the Event frames.

- [#778](https://github.com/cloudflare/wrangler2/pull/778) [`85b0c31`](https://github.com/cloudflare/wrangler2/commit/85b0c31a852985e353e455d116358693509c6cd5) Thanks [@threepointone](https://github.com/threepointone)! - feat: optionally send zone_id with a route

  This enables optionally passing a route as `{pattern: string, zone_id: string}`. There are scenarios where we need to explicitly pass a zone_id to the api, so this enables that.

  Some nuance: The errors from the api aren't super useful when invalid values are passed, but that's something to further work on.

  This also fixes some types in our cli parsing.

  Fixes https://github.com/cloudflare/wrangler2/issues/774

* [#797](https://github.com/cloudflare/wrangler2/pull/797) [`67fc4fc`](https://github.com/cloudflare/wrangler2/commit/67fc4fc68741df9054eb795ac93ef223866ffbe9) Thanks [@threepointone](https://github.com/threepointone)! - feat: optionally send `zone_name` with routes

  A followup to https://github.com/cloudflare/wrangler2/pull/778, this lets you send an optional `zone_name` with routes. This is particularly useful when using ssl for saas (https://developers.cloudflare.com/ssl/ssl-for-saas/).

  Fixes https://github.com/cloudflare/wrangler2/issues/793

- [#813](https://github.com/cloudflare/wrangler2/pull/813) [`5c59f97`](https://github.com/cloudflare/wrangler2/commit/5c59f97bbd79db61992f48ac6b9ae6483a27b0d7) Thanks [@threepointone](https://github.com/threepointone)! - add a warning if service environments are being used.

  Service environments are not ready for widespread usage, and their behaviour is going to change. This adds a warning if anyone uses them.

  Closes https://github.com/cloudflare/wrangler2/issues/809

* [#789](https://github.com/cloudflare/wrangler2/pull/789) [`5852bba`](https://github.com/cloudflare/wrangler2/commit/5852bbaf5d0b6f58a7e911818031d1c27a8df206) Thanks [@threepointone](https://github.com/threepointone)! - polish: don't log all errors when logging in

  This removes a couple of logs we had for literally every error in our oauth flow. We throw the error and handle it separately anyway, so this is a safe cleanup.

  Fixes https://github.com/cloudflare/wrangler2/issues/788

- [#806](https://github.com/cloudflare/wrangler2/pull/806) [`b24aeb5`](https://github.com/cloudflare/wrangler2/commit/b24aeb5722370c2e04bce97a84a1fa1e55725d79) Thanks [@threepointone](https://github.com/threepointone)! - fix: check for updates on the right channel

  This makes the update checker run on the channel that the version being used runs on.

* [#807](https://github.com/cloudflare/wrangler2/pull/807) [`7e560e1`](https://github.com/cloudflare/wrangler2/commit/7e560e1ad967e32e68aa4e89701620b1327d8bd1) Thanks [@threepointone](https://github.com/threepointone)! - fix: read `isLegacyEnv` correctly

  This fixes the signature for `isLegacyEnv()` since it doesn't use args, and we fix reading legacy_env correctly when creating a draft worker when creating a secret.

- [#779](https://github.com/cloudflare/wrangler2/pull/779) [`664803e`](https://github.com/cloudflare/wrangler2/commit/664803e6636785103336333999c2ae784b60463f) Thanks [@threepointone](https://github.com/threepointone)! - chore: update packages

  This updates some dependencies. Some highlights -

  - updates to `@iarna/toml` means we can have mixed types for inline arrays, which is great for #774 / https://github.com/cloudflare/wrangler2/pull/778
  - I also moved timeago.js to `devDependencies` since it already gets compiled into the bundle
  - updates to `esbuild` brings along a number of smaller fixes for modern js

* [#810](https://github.com/cloudflare/wrangler2/pull/810) [`0ce47a5`](https://github.com/cloudflare/wrangler2/commit/0ce47a587a029db9caa6e402ba3e7228ebb31c4c) Thanks [@caass](https://github.com/caass)! - Make `wrangler tail` TTY-aware, and stop printing non-JSON in JSON mode

  Closes #493

  2 quick fixes:

  - Check `process.stdout.isTTY` at runtime to determine whether to default to "pretty" or "json" output for tailing.
  - Only print messages like "Connected to {worker}" if in "pretty" mode (errors still throw strings)

## 0.0.25

### Patch Changes

- [#752](https://github.com/cloudflare/wrangler2/pull/752) [`6d43e94`](https://github.com/cloudflare/wrangler2/commit/6d43e94fb8a739b918bcd808683651f78180dfd8) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add a warning if `dev` is defaulting to the latest compatibility-date

  Fixes https://github.com/cloudflare/wrangler2/issues/741

* [#767](https://github.com/cloudflare/wrangler2/pull/767) [`836ad59`](https://github.com/cloudflare/wrangler2/commit/836ad5910f2c3b5d6169f8f0f0e522710158f658) Thanks [@threepointone](https://github.com/threepointone)! - fix: use cwd for `--experiment-enable-local-persistence`

  This sets up `--experiment-enable-local-persistence` to explicitly use `process.cwd() + wrangler-local-state` as a path to store values. Without it, local mode uses the temp dir that we use to bundle the worker, which gets wiped out on ending wrangler dev. In the future, based on usage, we may want to make the path configurable as well.

  Fixes https://github.com/cloudflare/wrangler2/issues/766

- [#723](https://github.com/cloudflare/wrangler2/pull/723) [`7942936`](https://github.com/cloudflare/wrangler2/commit/79429367f451d53a74413fd942053c3f732fe998) Thanks [@threepointone](https://github.com/threepointone)! - fix: spread tail messages when logging

  Logged messages (via console, etc) would previously be logged as an array of values. This spreads it when logging to match what is expected.

* [#756](https://github.com/cloudflare/wrangler2/pull/756) [`8e38442`](https://github.com/cloudflare/wrangler2/commit/8e384427a384fd32e7b1552e6edd898e8d4361a1) Thanks [@threepointone](https://github.com/threepointone)! - fix: resolve raw file bindings correctly in `wrangler dev` local mode

  For `wasm_modules`/`text_blobs`/`data_blobs` in local mode, we need to rewrite the paths as absolute so that they're resolved correctly by miniflare. This also expands some coverage for local mode `wrangler dev`.

  Fixes https://github.com/cloudflare/wrangler2/issues/740
  Fixes https://github.com/cloudflare/wrangler2/issues/416

- [#699](https://github.com/cloudflare/wrangler2/pull/699) [`ea8e701`](https://github.com/cloudflare/wrangler2/commit/ea8e7015776b7ac1e15cd14d436d57403a8c5127) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - polish: added logout and login to helpstring message.

* [#728](https://github.com/cloudflare/wrangler2/pull/728) [`0873049`](https://github.com/cloudflare/wrangler2/commit/087304941d69b7bbabb40cfabcb553c631f1a23d) Thanks [@threepointone](https://github.com/threepointone)! - fix: only send durable object migrations when required

  We had a bug where even if you'd published a script with migrations, we would still send a blank set of migrations on the next round. The api doesn't accept this, so the fix is to not do so. I also expanded test coverage for migrations.

  Fixes https://github.com/cloudflare/wrangler2/issues/705

- [#750](https://github.com/cloudflare/wrangler2/pull/750) [`b933641`](https://github.com/cloudflare/wrangler2/commit/b9336414c3c1ac20ba34d274042886ea802385d9) Thanks [@mrbbot](https://github.com/mrbbot)! - Upgrade `miniflare` to [`2.4.0`](https://github.com/cloudflare/miniflare/releases/tag/v2.4.0)

* [#763](https://github.com/cloudflare/wrangler2/pull/763) [`f72c943`](https://github.com/cloudflare/wrangler2/commit/f72c943e6f320fc1af93a9aab21fd93371d941df) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: Added the update check that will check the package once a day against the beta release, `distTag` can be changed later, then prints the latestbeta version to the user.

  resolves #762

- [#695](https://github.com/cloudflare/wrangler2/pull/695) [`48fa89b`](https://github.com/cloudflare/wrangler2/commit/48fa89b86d5b76b43cfd25035e914c32778eb80e) Thanks [@caass](https://github.com/caass)! - fix: stop wrangler spamming console after login

  If a user hasn't logged in and then they run a command that needs a login they'll get bounced to the login flow.
  The login flow (if completed) would write their shiny new OAuth2 credentials to disk, but wouldn't reload the
  in-memory state. This led to issues like #693, where even though the user was logged in on-disk, wrangler
  wouldn't be aware of it.

  We now update the in-memory login state each time new credentials are written to disk.

* [#734](https://github.com/cloudflare/wrangler2/pull/734) [`a1dadac`](https://github.com/cloudflare/wrangler2/commit/a1dadacbc2a994fb6cddd1cf8613a0dc3c69a49d) Thanks [@threepointone](https://github.com/threepointone)! - fix: exit dev if build fails on first run

  Because of https://github.com/evanw/esbuild/issues/1037, we can't recover dev if esbuild fails on first run. The workaround is to end the process if it does so, until we have a better fix.

  Reported in https://github.com/cloudflare/wrangler2/issues/731

- [#757](https://github.com/cloudflare/wrangler2/pull/757) [`13e57cd`](https://github.com/cloudflare/wrangler2/commit/13e57cdca626cf0f38640c4aab1aa1ee1969312b) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - feature: Add wrangler pages project list

  Adds a new command to list your projects in Cloudflare Pages.

* [#745](https://github.com/cloudflare/wrangler2/pull/745) [`6bc3e85`](https://github.com/cloudflare/wrangler2/commit/6bc3e859346dda825eb58fd684260840f70a6259) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add hotkey to clear the console in `wrangler dev`

  Closes #388

- [#747](https://github.com/cloudflare/wrangler2/pull/747) [`db6b830`](https://github.com/cloudflare/wrangler2/commit/db6b830f217ce0ff7e12bbaee851688ee39d8734) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: remove `process.exit()` from the pages code

  This enables simpler testing, as we do not have to spawn new child processes
  to avoid the `process.exit()` from killing the jest process.

  As part of the refactor, some of the `Error` classes have been moved to a
  shared `errors.ts` file.

* [#726](https://github.com/cloudflare/wrangler2/pull/726) [`c4e5dc3`](https://github.com/cloudflare/wrangler2/commit/c4e5dc332e8a31ea7e6d74861597d17b446eb68f) Thanks [@threepointone](https://github.com/threepointone)! - fix: assume a worker is a module worker only if it has a `default` export

  This tweaks the logic that guesses worker formats to check whether a `default` export is defined on an entry point before assuming it's a module worker.

- [#735](https://github.com/cloudflare/wrangler2/pull/735) [`c38ae3d`](https://github.com/cloudflare/wrangler2/commit/c38ae3dd36464522e13f32813123fd7b4deb6be3) Thanks [@threepointone](https://github.com/threepointone)! - `text_blobs`/Text module support for service worker format in local mode

  This adds support for `text_blobs`/Text module support in local mode. Now that https://github.com/cloudflare/miniflare/pull/228 has landed in miniflare (thanks @caass!), we can use that in wrangler as well.

* [#743](https://github.com/cloudflare/wrangler2/pull/743) [`ac5c48b`](https://github.com/cloudflare/wrangler2/commit/ac5c48b90f05b5464bb6bd3affdad3beba0c26a2) Thanks [@threepointone](https://github.com/threepointone)! - feat: implement `[data_blobs]`

  This implements `[data_blobs]` support for service-worker workers, as well as enabling Data module support for service-worker workers. `data_blob` is a supported binding type, but we never implemented support for it in v1. This implements support, and utilises it for supporting Data modules in service worker format. Implementation wise, it's incredibly similar to how we implemented `text_blobs`, with relevant changes.

  Partial fix for https://github.com/cloudflare/wrangler2/issues/740 pending local mode support.

- [#753](https://github.com/cloudflare/wrangler2/pull/753) [`cf432ac`](https://github.com/cloudflare/wrangler2/commit/cf432ac0150a205bd6a32f996d15a75515d269d6) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: distinguish the command hotkeys in wrangler dev

  Closes #354

* [#746](https://github.com/cloudflare/wrangler2/pull/746) [`3e25dcb`](https://github.com/cloudflare/wrangler2/commit/3e25dcb377b29181ae0bf2210180f1b17c34f971) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: remove superfluous debugger log messages from local dev

  Closes #387

- [#758](https://github.com/cloudflare/wrangler2/pull/758) [`9bd95ce`](https://github.com/cloudflare/wrangler2/commit/9bd95cea7399bd3240a3fdb017c3abb33602f807) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - feature: Add wrangler pages deployment list

  Renders a list of deployments in a Cloudflare Pages project

* [#733](https://github.com/cloudflare/wrangler2/pull/733) [`91873e4`](https://github.com/cloudflare/wrangler2/commit/91873e422f0aaed5596b98f626484ccadc400c67) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - polish: improved visualization of the deprecation messages between serious and warnings with emojis. This also improves the delineation between messages.

- [#738](https://github.com/cloudflare/wrangler2/pull/738) [`c04791c`](https://github.com/cloudflare/wrangler2/commit/c04791c0214601d6b1e767484c961a343f6c034a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add support for cron triggers in `dev --local` mode

  Currently, I don't know if there is support for doing this in "remote" dev mode.

  Resolves #737

* [#732](https://github.com/cloudflare/wrangler2/pull/732) [`c63ea3d`](https://github.com/cloudflare/wrangler2/commit/c63ea3deb98bf862e8f87a366c4ea654ec503092) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: abort async operations in the `Remote` component to avoid unwanted side-effects
  When the `Remote` component is unmounted, we now signal outstanding `fetch()` requests, and
  `waitForPortToBeAvailable()` tasks to cancel them. This prevents unexpected requests from appearing
  after the component has been unmounted, and also allows the process to exit cleanly without a delay.

  fixes #375

## 0.0.24

### Patch Changes

- [#719](https://github.com/cloudflare/wrangler2/pull/719) [`6503ace`](https://github.com/cloudflare/wrangler2/commit/6503ace108d1bd81d908fc8dcd0c3506903e4c63) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure the correct worker name is published in legacy environments

  When a developer uses `--env` to specify an environment name, the Worker name should
  be computed from the top-level Worker name and the environment name.

  When the given environment name does not match those in the wrangler.toml, we error.
  But if no environments have been specified in the wrangler.toml, at all, then we only
  log a warning and continue.

  In this second case, we were reusing the top-level environment, which did not have the
  correct legacy environment fields set, such as the name. Now we ensure that such an
  environment is created as needed.

  See https://github.com/cloudflare/wrangler2/pull/680#issuecomment-1080407556

* [#708](https://github.com/cloudflare/wrangler2/pull/708) [`763dcb6`](https://github.com/cloudflare/wrangler2/commit/763dcb650c2b7b8f2a0169ff5592a88375cb9974) Thanks [@threepointone](https://github.com/threepointone)! - fix: unexpected commands and arguments should throw

  This enables strict mode in our command line parser (yargs), so that unexpected commands and options uniformly throw errors.

  Fixes https://github.com/cloudflare/wrangler2/issues/706

- [#713](https://github.com/cloudflare/wrangler2/pull/713) [`18d09c7`](https://github.com/cloudflare/wrangler2/commit/18d09c7f8d70fa7288fbf8455d6e0c15125a6b78) Thanks [@threepointone](https://github.com/threepointone)! - fix: don't fetch zone id for `wrangler dev --local`

  We shouldn't try to resolve a domain/route to a zone id when starting in local mode (since there may not even be network).

* [#692](https://github.com/cloudflare/wrangler2/pull/692) [`52ea60f`](https://github.com/cloudflare/wrangler2/commit/52ea60f2c0e082e7db5926cca74d79f48afbdf3b) Thanks [@threepointone](https://github.com/threepointone)! - fix: do not deploy to workers.dev when routes are defined in an environment

  When `workers_dev` is not configured, we had a bug where it would default to true inside an environment even when there were routes defined, thus publishing both to a `workers.dev` subdomain as well as the defined routes. The fix is to default `workers_dev` to `undefined`, and check when publishing whether or not to publish to `workers.dev`/defined routes.

  Fixes https://github.com/cloudflare/wrangler2/issues/690

- [#687](https://github.com/cloudflare/wrangler2/pull/687) [`8f7ac7b`](https://github.com/cloudflare/wrangler2/commit/8f7ac7b3f009f2ce63bd880f7d73c2b675a2e8d7) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add warning about `wrangler dev` with remote Durable Objects

  Durable Objects that are being bound by `script_name` will not be isolated from the
  live data during development with `wrangler dev`.
  This change simply warns the developer about this, so that they can back out before
  accidentally changing live data.

  Fixes #319

* [#661](https://github.com/cloudflare/wrangler2/pull/661) [`6967086`](https://github.com/cloudflare/wrangler2/commit/696708692c88b0f4a25d954d675bece57043fa19) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - polish: add "Beta" messaging around the CLI command for Pages. Explicitly specifying the command is Beta, not to be confused with Pages itself which is production ready.

- [#709](https://github.com/cloudflare/wrangler2/pull/709) [`7e8ec9a`](https://github.com/cloudflare/wrangler2/commit/7e8ec9a0807deacd58cd25f5a8fd7d21b2fdb535) Thanks [@threepointone](https://github.com/threepointone)! - fix: trigger login flow if refreshtoken isn't valid

  If the auth refresh token isn't valid, then we should trigger the login flow. Reported in https://github.com/cloudflare/wrangler2/issues/316

* [#702](https://github.com/cloudflare/wrangler2/pull/702) [`241000f`](https://github.com/cloudflare/wrangler2/commit/241000f3741eaed20a0bdfdb734aae0c7cabbd6e) Thanks [@threepointone](https://github.com/threepointone)! - fix: setup jsx loaders when guessing worker format

  - We consider jsx to be regular js, and have setup our esbuild process to process js/mjs/cjs files as jsx.
  - We use a separate esbuild run on an entry point file when trying to guess the worker format, but hadn't setup the loaders there.
  - So if just the entrypoint file has any jsx in it, then we error because it can't parse the code.

  The fix is to add the same loaders to the esbuild run that guesses the worker format.

  Reported in https://github.com/cloudflare/wrangler2/issues/701

- [#711](https://github.com/cloudflare/wrangler2/pull/711) [`3dac1da`](https://github.com/cloudflare/wrangler2/commit/3dac1daaea56219d199c19f49c7616df539533aa) Thanks [@threepointone](https://github.com/threepointone)! - fix: default `wrangler tail` to pretty print

  Fixes https://github.com/cloudflare/wrangler2/issues/707

* [#712](https://github.com/cloudflare/wrangler2/pull/712) [`fb53fda`](https://github.com/cloudflare/wrangler2/commit/fb53fda3cbfca6cfa86147a151d882f3232b1439) Thanks [@threepointone](https://github.com/threepointone)! - feat: Non-interactive mode

  Continuing the work from https://github.com/cloudflare/wrangler2/pull/325, this detects when wrangler is running inside an environment where "raw" mode is not available on stdin, and disables the features for hot keys and the shortcut bar. This also adds stubs for testing local mode functionality in `local-mode-tests`, and deletes the previous hacky `dev2.test.tsx`.

  Fixes https://github.com/cloudflare/wrangler2/issues/322

- [#716](https://github.com/cloudflare/wrangler2/pull/716) [`6987cf3`](https://github.com/cloudflare/wrangler2/commit/6987cf3964fa53d31771fad631aa78cb5a8cad3b) Thanks [@threepointone](https://github.com/threepointone)! - feat: path to a custom `tsconfig`

  This adds a config field and a command line arg `tsconfig` for passing a path to a custom typescript configuration file. We don't do any typechecking, but we do pass it along to our build process so things like `compilerOptions.paths` get resolved correctly.

* [#665](https://github.com/cloudflare/wrangler2/pull/665) [`62a89c6`](https://github.com/cloudflare/wrangler2/commit/62a89c67f5dacf36e05c7d462410bf0d31844052) Thanks [@caass](https://github.com/caass)! - fix: validate that bindings have unique names

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

- [#698](https://github.com/cloudflare/wrangler2/pull/698) [`e3e3243`](https://github.com/cloudflare/wrangler2/commit/e3e3243bf2c9fd1284dae1eff30ccd756edff4e5) Thanks [@threepointone](https://github.com/threepointone)! - feat: inject `process.env.NODE_ENV` into scripts

  An extremely common pattern in the js ecosystem is to add additional behaviour gated by the value of `process.env.NODE_ENV`. For example, React leverages it heavily to add dev-time checks and warnings/errors, and to load dev/production versions of code. By doing this substitution ourselves, we can get a significant runtime boost in libraries/code that leverage this.

  This does NOT tackle the additional features of either minification, or proper node compatibility, or injecting wrangler's own environment name, which we will tackle in future PRs.

* [#680](https://github.com/cloudflare/wrangler2/pull/680) [`8e2cbaf`](https://github.com/cloudflare/wrangler2/commit/8e2cbaf718cfad279947f99107a0485f07b0f3b0) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - refactor: support backwards compatibility with environment names and related CLI flags

  1. When in Legacy environment mode we should not compute name field if specified in an environment.
  2. Throw an Error when `--env` and `--name` are used together in Legacy Environment, except for Secrets & Tail which are using a special case `getLegacyScriptName` for parity with Wrangler1
  3. Started the refactor for args being utilized at the Config level, currently checking for Legacy Environment only.

  Fixes https://github.com/cloudflare/wrangler2/issues/672

- [#684](https://github.com/cloudflare/wrangler2/pull/684) [`82ec7c2`](https://github.com/cloudflare/wrangler2/commit/82ec7c2c65b1515cf081420499091cd0878fed8d) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Fix `--binding` option for `wrangler pages dev`.

  We'd broken this with #581. This reverts that PR, and fixes it slightly differently. Also added an integration test to ensure we don't regress in the future.

* [#678](https://github.com/cloudflare/wrangler2/pull/678) [`82e4143`](https://github.com/cloudflare/wrangler2/commit/82e4143fe5ca6973b15111fd7f142a064a95ea93) Thanks [@threepointone](https://github.com/threepointone)! - fix: cleanup after `pages dev` tests

  We weren't killing the process started by wrangler whenever its parent was killed. This fix is to listen on SIGINT/SIGTERM and kill that process. I also did some minor configuration cleanups.

  Fixes https://github.com/cloudflare/wrangler2/issues/397
  Fixes https://github.com/cloudflare/wrangler2/issues/618

## 0.0.23

### Patch Changes

- [#675](https://github.com/cloudflare/wrangler2/pull/675) [`e88a54e`](https://github.com/cloudflare/wrangler2/commit/e88a54ed41ec9e5de707d35115f5bc7395b0d28f) Thanks [@threepointone](https://github.com/threepointone)! - fix: resolve non-js modules correctly in local mode

  In https://github.com/cloudflare/wrangler2/pull/633, we missed passing a cwd to the process that runs the miniflare cli. This broke how miniflare resolves modules, and led back to the dreaded "path should be a `path.relative()`d string" error. The fix is to simply pass the cwd to the `spawn` call.

  Test plan:

  ```
  cd packages/wrangler
  npm run build
  cd ../workers-chat-demo
  npx wrangler dev --local
  ```

* [#668](https://github.com/cloudflare/wrangler2/pull/668) [`3dcdb0d`](https://github.com/cloudflare/wrangler2/commit/3dcdb0d7dfdfd842228987e8b095ca5526d7404d) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: tighten up the named environment configuration

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

- [#633](https://github.com/cloudflare/wrangler2/pull/633) [`003f3c4`](https://github.com/cloudflare/wrangler2/commit/003f3c41942ec8e299ae603fe74b3cd2e802b49d) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - refactor: create a custom CLI wrapper around Miniflare API

  This allows us to tightly control the options that are passed to Miniflare.
  The current CLI is setup to be more compatible with how Wrangler 1 works, which is not optimal for Wrangler 2.

* [#633](https://github.com/cloudflare/wrangler2/pull/633) [`84c857e`](https://github.com/cloudflare/wrangler2/commit/84c857eabc2c09ad1dd2f4fa3963638b8b7f3daa) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - fix: ensure asset keys are relative to the project root

  Previously, asset file paths were computed relative to the current working
  directory, even if we had used `-c` to run Wrangler on a project in a different
  directory to the current one.

  Now, assets file paths are computed relative to the "project root", which is
  either the directory containing the wrangler.toml or the current working directory
  if there is no config specified.

- [#673](https://github.com/cloudflare/wrangler2/pull/673) [`456e1da`](https://github.com/cloudflare/wrangler2/commit/456e1da5347afb103ba0827ba632a0b6aa81de6f) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: allow the `build` field to be inherited/overridden in a named environment"

  Now the `build` field can be specified within a named environment, overriding whatever
  may appear at the top level.

  Resolves https://github.com/cloudflare/wrangler2/issues/588

* [#650](https://github.com/cloudflare/wrangler2/pull/650) [`d3d1ff8`](https://github.com/cloudflare/wrangler2/commit/d3d1ff8721dd834ce5e58b652cccd7806cba1711) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: make `main` an inheritable environment field

  See [#588](https://github.com/cloudflare/wrangler2/issues/588)

- [#650](https://github.com/cloudflare/wrangler2/pull/650) [`f0eed7f`](https://github.com/cloudflare/wrangler2/commit/f0eed7fe0cc5f6166b4c2b34d193e260b881e4de) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: make validation error messages more consistent

* [#662](https://github.com/cloudflare/wrangler2/pull/662) [`612952b`](https://github.com/cloudflare/wrangler2/commit/612952ba11b198277be14c70d1c4090338c876bc) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - bugfix: use alias `-e` for `--env` to prevent scripts using Wrangler 1 from breaking when switching to Wrangler 2.

- [#671](https://github.com/cloudflare/wrangler2/pull/671) [`ef0aaad`](https://github.com/cloudflare/wrangler2/commit/ef0aaadad180face06e13fb1de079eb040badaf2) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: don't exit on initial Pages Functions compilation failure

  Previously, we'd exit the `wrangler pages dev` process if we couldn't immediately compile a Worker from the `functions` directory. We now log the error, but don't exit the process. This means that proxy processes can be cleaned up cleanly on SIGINT and SIGTERM, and it matches the behavior of if a compilation error is introduced once already running (we don't exit then either).

* [#667](https://github.com/cloudflare/wrangler2/pull/667) [`e29a241`](https://github.com/cloudflare/wrangler2/commit/e29a24168da2e87259b90d1a4dd0d3860bb3ba8e) Thanks [@threepointone](https://github.com/threepointone)! - fix: delete unused `[site]` assets

  We discovered critical issues with the way we expire unused assets with `[site]` (see https://github.com/cloudflare/wrangler2/issues/666, https://github.com/cloudflare/wrangler/issues/2224), that we're going back to the legacy manner of handling unused assets, i.e- deleting unused assets.

  Fixes https://github.com/cloudflare/wrangler2/issues/666

- [#640](https://github.com/cloudflare/wrangler2/pull/640) [`2a2d50c`](https://github.com/cloudflare/wrangler2/commit/2a2d50c921ffcf8f9b8719dd029206f9479ebdd8) Thanks [@caass](https://github.com/caass)! - Error if the user is trying to implement DO's in a service worker

  Durable Objects can only be implemented in Module Workers, so we should throw if we detect that
  the user is trying to implement a Durable Object but their worker is in Service Worker format.

## 0.0.22

### Patch Changes

- [#656](https://github.com/cloudflare/wrangler2/pull/656) [`aeb0fe0`](https://github.com/cloudflare/wrangler2/commit/aeb0fe02dbc9b8ef2edc0e2a669315bd40bbdfb3) Thanks [@threepointone](https://github.com/threepointone)! - fix: resolve npm modules correctly

  When implementing legacy module specifiers, we didn't throughly test the interaction when there weren't any other files next to the entry worker, and importing npm modules. It would create a Regex that matched _every_ import, and fail because a file of that name wasn't present in the source directory. This fix constructs a better regex, applies it only when there are more files next to the worker, and increases test coverage for that scenario.

  Fixes https://github.com/cloudflare/wrangler2/issues/655

## 0.0.21

### Patch Changes

- [#647](https://github.com/cloudflare/wrangler2/pull/647) [`f3f3907`](https://github.com/cloudflare/wrangler2/commit/f3f3907963e87de17cad9a3733be716e201a8996) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add support for `--ip` and `config.dev.ip` in the dev command

  Note that this change modifies the default listening address to `localhost`, which is different to `127.0.0.1`, which is what Wrangler 1 does.
  For most developers this will make no observable difference, since the default host mapping in most OSes from `localhost` to `127.0.0.1`.

  Resolves [#584](https://github.com/cloudflare/wrangler2/issues/584)

## 0.0.20

### Patch Changes

- [#627](https://github.com/cloudflare/wrangler2/pull/627) [`ff53f4e`](https://github.com/cloudflare/wrangler2/commit/ff53f4e88a062936c4ae9a390307583017dbbb29) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: do not warn about miniflare in the configuration

* [#649](https://github.com/cloudflare/wrangler2/pull/649) [`e0b9366`](https://github.com/cloudflare/wrangler2/commit/e0b93661a7160e718b4fc0c58fa90149968d4317) Thanks [@threepointone](https://github.com/threepointone)! - fix: use `expiration_ttl` to expire assets with `[site]`

  This switches how we expire static assets with `[site]` uploads to use `expiration_ttl` instead of `expiration`. This is because we can't trust the time that a deploy target may provide (like in https://github.com/cloudflare/wrangler/issues/2224).

- [#599](https://github.com/cloudflare/wrangler2/pull/599) [`7d4ea43`](https://github.com/cloudflare/wrangler2/commit/7d4ea4342947128eb156a58da69dd008d504103b) Thanks [@caass](https://github.com/caass)! - Force-open a chromium-based browser for devtools

  We rely on Chromium-based devtools for debugging workers, so when opening up the devtools URL,
  we should force a chromium-based browser to launch. For now, this means checking (in order)
  for Chrome and Edge, and then failing if neither of those are available.

* [#567](https://github.com/cloudflare/wrangler2/pull/567) [`05b81c5`](https://github.com/cloudflare/wrangler2/commit/05b81c5809b9ceed10d0c21c0f5f5de76b23a67d) Thanks [@threepointone](https://github.com/threepointone)! - fix: consolidate `getEntry()` logic

  This consolidates some logic into `getEntry()`, namely including `guessWorkerFormat()` and custom builds. This simplifies the code for both `dev` and `publish`.

  - Previously, the implementation of custom builds inside `dev` assumed it could be a long running process; however it's not (else consider that `publish` would never work).
  - By running custom builds inside `getEntry()`, we can be certain that the entry point exists as we validate it and before we enter `dev`/`publish`, simplifying their internals
  - We don't have to do periodic checks inside `wrangler dev` because it's now a one shot build (and always should have been)
  - This expands test coverage a little for both `dev` and `publish`.
  - The 'format' of a worker is intrinsic to its contents, so it makes sense to establish its value inside `getEntry()`
  - This also means less async logic inside `<Dev/>`, which is always a good thing

- [#628](https://github.com/cloudflare/wrangler2/pull/628) [`b640ab5`](https://github.com/cloudflare/wrangler2/commit/b640ab514a9a62ffd3ee63438354ea167e80c873) Thanks [@caass](https://github.com/caass)! - Validate that if `route` exists in wrangler.toml, `routes` does not (and vice versa)

* [#591](https://github.com/cloudflare/wrangler2/pull/591) [`42c2c0f`](https://github.com/cloudflare/wrangler2/commit/42c2c0fda6820dc7b8c0005857459d55ec82d266) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add warning about setting upstream-protocol to `http`

  We have not implemented setting upstream-protocol to `http` and currently do not intend to.

  This change just adds a warning if a developer tries to do so and provides a link to an issue where they can add their use-case.

- [#596](https://github.com/cloudflare/wrangler2/pull/596) [`187264d`](https://github.com/cloudflare/wrangler2/commit/187264d4013842df4062a1e0f5dd8cef0b30d0a8) Thanks [@threepointone](https://github.com/threepointone)! - feat: support wrangler 1.x module specifiers with a deprecation warning

  This implements wrangler 1.x style module specifiers, but also logs a deprecation warning for every usage.

  Consider a project like so:

  ```
    project
    ├── index.js
    └── some-dependency.js
  ```

  where the content of `index.js` is:

  ```jsx
  import SomeDependency from "some-dependency.js";
  addEventListener("fetch", event => {
    // ...
  });
  ```

  `wrangler` 1.x would resolve `import SomeDependency from "some-dependency.js";` to the file `some-dependency.js`. This will work in `wrangler` v2, but it will log a deprecation warning. Instead, you should rewrite the import to specify that it's a relative path, like so:

  ```diff
  - import SomeDependency from "some-dependency.js";
  + import SomeDependency from "./some-dependency.js";
  ```

  In a near future version, this will become a breaking deprecation and throw an error.

  (This also updates `workers-chat-demo` to use the older style specifier, since that's how it currently is at https://github.com/cloudflare/workers-chat-demo)

  Known issue: This might not work as expected with `.js`/`.cjs`/`.mjs` files as expected, but that's something to be fixed overall with the module system.

  Closes https://github.com/cloudflare/wrangler2/issues/586

* [#579](https://github.com/cloudflare/wrangler2/pull/579) [`2f0e59b`](https://github.com/cloudflare/wrangler2/commit/2f0e59bed76676f088403c7f0ceb9046668c547d) Thanks [@JacobMGEvans](https://github.com/JacobMGEvans)! - feat: Incomplete subcommands render a help message for that specific subcommand.

- [#559](https://github.com/cloudflare/wrangler2/pull/559) [`16fb5e6`](https://github.com/cloudflare/wrangler2/commit/16fb5e686024aba614d805a4edb49fb53a8e32db) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: support adding secrets in non-interactive mode

  Now the user can pipe in the secret value to the `wrangler secret put` command.
  For example:

  ```
  cat my-secret.txt | wrangler secret put secret-key --name worker-name
  ```

  This requires that the user is logged in, and has only one account, or that the `account_id` has been set in `wrangler.toml`.

  Fixes #170

* [#597](https://github.com/cloudflare/wrangler2/pull/597) [`94c2698`](https://github.com/cloudflare/wrangler2/commit/94c2698cd6d62ec7cb69530697f2eac2bf068163) Thanks [@caass](https://github.com/caass)! - Deprecate `wrangler route`, `wrangler route list`, and `wrangler route delete`

  Users should instead modify their wrangler.toml or use the `--routes` flag when publishing
  to manage routes.

- [#564](https://github.com/cloudflare/wrangler2/pull/564) [`ffd5c0d`](https://github.com/cloudflare/wrangler2/commit/ffd5c0d1b93871e751371bf45498bfc468fa5b84) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Request Pages OAuth scopes when logging in

* [#638](https://github.com/cloudflare/wrangler2/pull/638) [`06f9278`](https://github.com/cloudflare/wrangler2/commit/06f9278d69dfe137ed9837e29bbf48bbd364e8c1) Thanks [@threepointone](https://github.com/threepointone)! - polish: add a small banner for commands

  This adds a small banner for most commands. Specifically, we avoid any commands that maybe used as a parse input (like json into jq). The banner itself simply says "⛅️ wrangler" with an orange underline.

- [#561](https://github.com/cloudflare/wrangler2/pull/561) [`6e9a219`](https://github.com/cloudflare/wrangler2/commit/6e9a219f53b7d13bee94c8468846553df48c72c3) Thanks [@threepointone](https://github.com/threepointone)! - fix: resolve modules correctly in `wrangler dev --local`

  This is an alternate fix to https://github.com/cloudflare/miniflare/pull/205, and fixes the error where miniflare would get confused resolving relative modules on macs because of `/var`/`/private/var` being symlinks. Instead, we `realpathSync` the bundle path before passing it on to miniflare, and that appears to fix the problem.

  Test plan:

  ```
  cd packages/wrangler
  npm run build
  cd ../workers-chat-demo
  npx wrangler dev --local
  ```

  Fixes https://github.com/cloudflare/wrangler2/issues/443

* [#592](https://github.com/cloudflare/wrangler2/pull/592) [`56886cf`](https://github.com/cloudflare/wrangler2/commit/56886cfc7edf02cf0ae029f380a517c0142fd467) Thanks [@caass](https://github.com/caass)! - Stop reporting breadcrumbs to sentry

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

- [#645](https://github.com/cloudflare/wrangler2/pull/645) [`61aea30`](https://github.com/cloudflare/wrangler2/commit/61aea3052f90dc7a05f77dd2d60e8b32af143a83) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: improve authentication logging and warnings

  - If a user has previously logged in via Wrangler 1 with an API token, we now display a helpful warning.
  - When logging in and out, we no longer display the path to the internal user auh config file.
  - When logging in, we now display an initial message to indicate the authentication flow is starting.

  Fixes [#526](https://github.com/cloudflare/wrangler2/issues/526)

* [#608](https://github.com/cloudflare/wrangler2/pull/608) [`a7fa544`](https://github.com/cloudflare/wrangler2/commit/a7fa544f4050f2b2eea573fcac784b148de25bc6) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - fix: Ensure generateConfigFromFileTree generates config correctly for multiple splats

  Functions with multiple parameters, like /near/[latitude]/[longitude].ts wouldn't work. This
  fixes that.

- [#580](https://github.com/cloudflare/wrangler2/pull/580) [`8013e0a`](https://github.com/cloudflare/wrangler2/commit/8013e0a86cb309f912bd1068725d4a5535795082) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add support for `--local-protocol=https` to `wrangler dev`

  This change adds full support for the setting the protocol that the localhost proxy server listens to.
  Previously, it was only possible to use `HTTP`. But now you can set it to `HTTPS` as well.

  To support `HTTPS`, Wrangler needs an SSL certificate.
  Wrangler now generates a self-signed certificate, as needed, and caches it in the `~/.wrangler/local-cert` directory.
  These certificates expire after 30 days and are regenerated by Wrangler as needed.

  Note that if you use HTTPS then your browser will complain about the self-signed and you must tell it to accept the certificate before it will let you access the page.

* [#639](https://github.com/cloudflare/wrangler2/pull/639) [`5161e1e`](https://github.com/cloudflare/wrangler2/commit/5161e1e85c4cb6604c54a791301e38cb90e57632) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: initialize the user auth state synchronously

  We can now initialize the user state synchronously, which means that
  we can remove the checks for whether it has been done or not in each
  of the user auth functions.

- [#580](https://github.com/cloudflare/wrangler2/pull/580) [`aaac8dd`](https://github.com/cloudflare/wrangler2/commit/aaac8ddfda9658a2cb35b757518ee085a994dfe5) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: validate that local_protocol and upstream_protocol can only take "http" or "https"

* [#568](https://github.com/cloudflare/wrangler2/pull/568) [`b6f2266`](https://github.com/cloudflare/wrangler2/commit/b6f226624417ffa4b5e7c3098d4955bc23d58603) Thanks [@caass](https://github.com/caass)! - Show an actionable error message when publishing to a workers.dev subdomain that hasn't been created yet.

  When publishing a worker to workers.dev, you need to first have registered your workers.dev subdomain
  (e.g. my-subdomain.workers.dev). We now check to ensure that the user has created their subdomain before
  uploading a worker to workers.dev, and if they haven't, we provide a link to where they can go through
  the workers onboarding flow and create one.

- [#641](https://github.com/cloudflare/wrangler2/pull/641) [`21ee93e`](https://github.com/cloudflare/wrangler2/commit/21ee93e40ad5870328f22f106113ffc88a212894) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: error if a non-legacy service environment tries to define a worker name

  Given that service environments all live off the same worker, it doesn't make sense
  for them to have different names.

  This change adds validation to tell the developer to remove such `name` fields in
  service environment config.

  Fixes #623

* [#646](https://github.com/cloudflare/wrangler2/pull/646) [`c75cfb8`](https://github.com/cloudflare/wrangler2/commit/c75cfb83df4c98d6f678535439483948ce9fff5b) Thanks [@threepointone](https://github.com/threepointone)! - fix: default `watch_dir` to `src` of project directory

  Via wrangler 1, when using custom builds in `wrangler dev`, `watch_dir` should default to `src` of the "project directory" (i.e - wherever the `wrangler.toml` is defined if it exists, else in the cwd.

  Fixes https://github.com/cloudflare/wrangler2/issues/631

- [#621](https://github.com/cloudflare/wrangler2/pull/621) [`e452a04`](https://github.com/cloudflare/wrangler2/commit/e452a041fbe7439eff88ab34a1d2124ee0dff40a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: stop checking for open port once it has timed out in `waitForPortToBeAvailable()`

  Previously, if `waitForPortToBeAvailable()` timed out, the `checkPort()`
  function would continue to be called.
  Now we clean up fully once the promise is resolved or rejected.

* [#600](https://github.com/cloudflare/wrangler2/pull/600) [`1bbd834`](https://github.com/cloudflare/wrangler2/commit/1bbd8340d2f9868e6384e2ef58e6f73ec6b6dda7) Thanks [@skirsten](https://github.com/skirsten)! - fix: use environment specific and inherited config values in `publish`

- [#577](https://github.com/cloudflare/wrangler2/pull/577) [`7faf0eb`](https://github.com/cloudflare/wrangler2/commit/7faf0ebec1aa92f64c1a1d0d702d03f4cfa868cd) Thanks [@threepointone](https://github.com/threepointone)! - fix: `config.site.entry-point` as a breaking deprecation

  This makes configuring `site.entry-point` in config as a breaking deprecation, and throws an error. We do this because existing apps with `site.entry-point` _won't_ work in v2.

* [#578](https://github.com/cloudflare/wrangler2/pull/578) [`c56847c`](https://github.com/cloudflare/wrangler2/commit/c56847cb261e9899d60b50599f910efa9cefdee9) Thanks [@threepointone](https://github.com/threepointone)! - fix: gracefully fail if we can't create `~/.wrangler/reporting.toml`

  In some scenarios (CI/CD, docker, etc), we won't have write access to `~/.wrangler`. We already don't write a configuration file there if one passes a `CF_API_TOKEN`/`CLOUDFLARE_API_TOKEN` env var. This also adds a guard when writing the error reporting configuration file.

- [#621](https://github.com/cloudflare/wrangler2/pull/621) [`e452a04`](https://github.com/cloudflare/wrangler2/commit/e452a041fbe7439eff88ab34a1d2124ee0dff40a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: check for the correct inspector port in local dev

  Previously, the `useLocalWorker()` hook was being passed the wrong port for the `inspectorPort` prop.

  Once this was fixed, it became apparent that we were waiting for the port to become free in the wrong place, since this port is already being listened to in `useInspector()` by the time we were starting the check.

  Now, the check to see if the inspector port is free is done in `useInspector()`,
  which also means that `Remote` benefits from this check too.

* [#587](https://github.com/cloudflare/wrangler2/pull/587) [`49869a3`](https://github.com/cloudflare/wrangler2/commit/49869a367d5f5dc71c9f48e0daf1f5047b482185) Thanks [@threepointone](https://github.com/threepointone)! - feat: expire unused assets in `[site]` uploads

  This expires any previously uploaded assets when using a Sites / `[site]` configuration. Because we currently do a full iteration of a namespace's keys when publishing, for rapidly changing sites this means that uploads get slower and slower. We can't just delete unused assets because it leads to occasional 404s on older publishes while we're publishing. So we expire previous assets while uploading new ones. The implementation/constraints of the kv api means that uploads may become slower, but should hopefully be faster overall. These optimisations also only matter for rapidly changing sites, so common usecases still have the same perf characteristics.

- [#580](https://github.com/cloudflare/wrangler2/pull/580) [`9ef36a9`](https://github.com/cloudflare/wrangler2/commit/9ef36a903988d3c18982186ca272ff4d026ad8b2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: improve validation error message for fields that must be one of a selection of choices

## 0.0.19

### Patch Changes

- [#557](https://github.com/cloudflare/wrangler2/pull/557) [`835c3ae`](https://github.com/cloudflare/wrangler2/commit/835c3ae061f7b0dd67fa5e0bd56c445cb6666bf8) Thanks [@threepointone](https://github.com/threepointone)! - fix: wrangler dev on unnamed workers in remote mode

  With unnamed workers, we use the filename as the name of the worker, which isn't a valid name for workers because of the `.` (This break was introduced in https://github.com/cloudflare/wrangler2/pull/545). The preview service accepts unnamed workers and generates a hash anyway, so the fix is to simply not send it, and use the host that the service provides.

## 0.0.18

### Patch Changes

- [#523](https://github.com/cloudflare/wrangler2/pull/523) [`8c99449`](https://github.com/cloudflare/wrangler2/commit/8c99449b7d1ae4eb86607a4e1ff13fd012e6ec8c) Thanks [@threepointone](https://github.com/threepointone)! - feat: secrets + environments

  This implements environment support for `wrangler secret` (both legacy and services). We now consistently generate the right script name across commands with the `getScriptName()` helper.

  Based on the work by @mitchelvanbever in https://github.com/cloudflare/wrangler2/pull/95.

* [#554](https://github.com/cloudflare/wrangler2/pull/554) [`18ac439`](https://github.com/cloudflare/wrangler2/commit/18ac4398f8f6e3ed3d663ee61ceb7388510390aa) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: limit bulk put API requests to batches of 5,000

  The `kv:bulk put` command now batches up put requests in groups of 5,000,
  displaying progress for each request.

- [#437](https://github.com/cloudflare/wrangler2/pull/437) [`2805205`](https://github.com/cloudflare/wrangler2/commit/2805205d83fa6c960351d38517c8a4169067e4e6) Thanks [@jacobbednarz](https://github.com/jacobbednarz)! - feat: use `CLOUDFLARE_...` environment variables deprecating `CF_...`

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

* [#530](https://github.com/cloudflare/wrangler2/pull/530) [`fdb4afd`](https://github.com/cloudflare/wrangler2/commit/fdb4afdaf10bbc72c0f4d643f752f6aafe529058) Thanks [@threepointone](https://github.com/threepointone)! - feat: implement `rules` config field

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

- [#517](https://github.com/cloudflare/wrangler2/pull/517) [`201a6bb`](https://github.com/cloudflare/wrangler2/commit/201a6bb6db51ab3dde16fc496ab3c93b91d1de81) Thanks [@threepointone](https://github.com/threepointone)! - fix: publish environment specific routes

  This adds some tests for publishing routes, and fixes a couple of bugs with the flow.

  - fixes publishing environment specific routes, closes https://github.com/cloudflare/wrangler2/issues/513
  - default `workers_dev` to `false` if there are any routes specified
  - catches a hanging promise when we were toggling off a `workers.dev` subdomain (which should have been caught by the `no-floating-promises` lint rule, so that's concerning)
  - this also fixes publishing environment specific crons, but I'll write tests for that when I'm doing that feature in depth

* [#528](https://github.com/cloudflare/wrangler2/pull/528) [`26f5ad2`](https://github.com/cloudflare/wrangler2/commit/26f5ad23a98839ffaa3627681b36c58a656407a4) Thanks [@threepointone](https://github.com/threepointone)! - feat: top level `main` config field

  This implements a top level `main` field for `wrangler.toml` to define an entry point for the worker , and adds a deprecation warning for `build.upload.main`. The deprecation warning is detailed enough to give the exact line to copy-paste into your config file. Example -

  ```
  The `build.upload` field is deprecated. Delete the `build.upload` field, and add this to your configuration file:

  main = "src/chat.mjs"
  ```

  This also makes `./dist` a default for `build.upload.dir`, to match wrangler 1's behaviour.

  Closes https://github.com/cloudflare/wrangler2/issues/488

- [#521](https://github.com/cloudflare/wrangler2/pull/521) [`5947bfe`](https://github.com/cloudflare/wrangler2/commit/5947bfe469d03af3838240041814a9a1eb8f8bb6) Thanks [@threepointone](https://github.com/threepointone)! - chore: update esbuild from 0.14.18 to 0.14.23

* [#480](https://github.com/cloudflare/wrangler2/pull/480) [`10cb789`](https://github.com/cloudflare/wrangler2/commit/10cb789a3884db17c757a6f619c98abd930ced22) Thanks [@caass](https://github.com/caass)! - Refactored tail functionality in preparation for adding pretty printing.

  - Moved the `debug` toggle from a build-time constant to a (hidden) CLI flag
  - Implemented pretty-printing logs, togglable via `--format pretty` CLI option
  - Added stronger typing for tail event messages

- [#525](https://github.com/cloudflare/wrangler2/pull/525) [`9d5c14d`](https://github.com/cloudflare/wrangler2/commit/9d5c14db4e24db0e60ef83cdd40bfc7b5e9060b8) Thanks [@threepointone](https://github.com/threepointone)! - feat: tail+envs

  This implements service environment support for `wrangler tail`. Fairly simple, we just generate the right URLs. wrangler tail already works for legacy envs, so there's nothing to do there.

* [#553](https://github.com/cloudflare/wrangler2/pull/553) [`bc85682`](https://github.com/cloudflare/wrangler2/commit/bc85682028c70a1c4aff96d8f2e4314dc75d6785) Thanks [@threepointone](https://github.com/threepointone)! - feat: disable tunnel in `wrangler dev`

  Disables sharing local development server on the internet. We will bring this back after it's more polished/ready.

  Fixes https://github.com/cloudflare/wrangler2/issues/550

- [#522](https://github.com/cloudflare/wrangler2/pull/522) [`a283836`](https://github.com/cloudflare/wrangler2/commit/a283836577371bc3287d28e3671db9efe94400a1) Thanks [@threepointone](https://github.com/threepointone)! - fix: websockets

  This fixes websockets in `wrangler dev`. It looks like we broke it in https://github.com/cloudflare/wrangler2/pull/503. I've reverted the specific changes made to `proxy.ts`.

  Test plan -

  ```
  cd packages/wrangler
  npm run build
  cd ../workers-chat-demo
  npx wrangler dev

  ```

* [#481](https://github.com/cloudflare/wrangler2/pull/481) [`8874548`](https://github.com/cloudflare/wrangler2/commit/88745484106a37e862d5de56ae4b7599775d7e59) Thanks [@threepointone](https://github.com/threepointone)! - fix: replace the word "deploy" with "publish" everywhere.

  We should be consistent with the word that describes how we get a worker to the edge. The command is `publish`, so let's use that everywhere.

- [#537](https://github.com/cloudflare/wrangler2/pull/537) [`b978db4`](https://github.com/cloudflare/wrangler2/commit/b978db400e5c56d393e4f469b3ca5557994f8102) Thanks [@threepointone](https://github.com/threepointone)! - feat: `--local` mode only applies in `wrangler dev`

  We'd originally planned for `--local` mode to be a thing across all wrangler commands. In hindsight, that didn't make much sense, since every command other than `wrangler dev` assumes some interaction with cloudflare and their API. The only command other than dev where this "worked" was `kv`, but even that didn't make sense because wrangler dev wouldn't even read from it. We also have `--experimental-enable-local-persistence` there anyway.

  So this moves the `--local` flag to only apply for `wrangler dev` and removes any trace from other commands.

* [#518](https://github.com/cloudflare/wrangler2/pull/518) [`72f035e`](https://github.com/cloudflare/wrangler2/commit/72f035e47a586fd02278674b1b160f5cb34d1412) Thanks [@threepointone](https://github.com/threepointone)! - feat: implement `[text_blobs]`

  This implements support for `[text_blobs]` as defined by https://github.com/cloudflare/wrangler/pull/1677.

  Text blobs can be defined in service-worker format with configuration in `wrangler.toml` as -

  ```
  [text_blobs]
  MYTEXT = "./path/to/my-text.file"
  ```

  The content of the file will then be available as the global `MYTEXT` inside your code. Note that this ONLY makes sense in service-worker format workers (for now).

  Workers Sites now uses `[text_blobs]` internally. Previously, we were inlining the asset manifest into the worker itself, but we now attach the asset manifest to the uploaded worker. I also added an additional example of Workers Sites with a modules format worker.

- [#532](https://github.com/cloudflare/wrangler2/pull/532) [`046b17d`](https://github.com/cloudflare/wrangler2/commit/046b17d7a8721aafd5d50c40c7bf193dceea82f4) Thanks [@threepointone](https://github.com/threepointone)! - feat: dev+envs

  This implements service environments + `wrangler dev`. Fairly simple, it just needed the right url when creating the edge preview token.

  I tested this by publishing a service under one env, adding secrets under it in the dashboard, and then trying to dev under another env, and verifying that the secrets didn't leak.

* [#552](https://github.com/cloudflare/wrangler2/pull/552) [`3cee150`](https://github.com/cloudflare/wrangler2/commit/3cee1508d14c118f8ad817cfbf9992c3ca343bce) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add confirmation and success messages to `kv:bulk delete` command

  Added the following:

  - When the deletion completes, we get `Success!` logged to the console.
  - Before deleting, the user is now asked to confirm is that is desired.
  - A new flag `--force`/`-f` to avoid the confirmation check.

- [#533](https://github.com/cloudflare/wrangler2/pull/533) [`1b3a5f7`](https://github.com/cloudflare/wrangler2/commit/1b3a5f74b2f7ae5ed47d09c96ccb055d4b4cdfe8) Thanks [@threepointone](https://github.com/threepointone)! - feat: default to legacy environments

  While implementing support for service environments, we unearthed a small number of usage issues. While we work those out, we should default to using regular "legacy" environments.

* [#519](https://github.com/cloudflare/wrangler2/pull/519) [`93576a8`](https://github.com/cloudflare/wrangler2/commit/93576a853b6eff3810bdccb4b7496d77b5eb5416) Thanks [@caass](https://github.com/caass)! - fix: Improve port selection for `wrangler dev` for both worker ports and inspector ports.

  Previously when running `wrangler dev` on multiple workers at the same time, you couldn't attach DevTools to both workers, since they were both listening on port 9229.
  With this PR, that behavior is improved -- you can now pass an `--inspector-port` flag to specify a port for DevTools to connect to on a per-worker basis, or
  if the option is omitted, wrangler will assign a random unused port for you.

  This "if no option is given, assign a random unused port" behavior has also been added to `wrangler dev --port`, so running `wrangler dev` on two
  workers at once should now "just work". Hopefully.

- [#545](https://github.com/cloudflare/wrangler2/pull/545) [`9e89dd7`](https://github.com/cloudflare/wrangler2/commit/9e89dd7f868e10fcd3e09789f6f6a59dff8ed4e3) Thanks [@threepointone](https://github.com/threepointone)! - feat: zoned worker support for `wrangler dev`

  This implements support for zoned workers in `wrangler dev`. Of note, since we're deprecating `zone_id`, we instead use the domain provided via `--host`/`config.dev.host`/`--routes`/`--route`/`config.routes`/`config.route` and infer the zone id from it.

  Fixes https://github.com/cloudflare/wrangler2/issues/544

* [#494](https://github.com/cloudflare/wrangler2/pull/494) [`6e6c30f`](https://github.com/cloudflare/wrangler2/commit/6e6c30f7a32656c6db9f54318ffec6da147d45f6) Thanks [@caass](https://github.com/caass)! - - Add tests covering pretty-printing of logs in `wrangler tail`
  - Modify `RequestEvent` types
    - Change `Date` types to `number` to make parsing easier
    - Change `exception` and `log` `message` properties to `unknown`
  - Add datetime to pretty-printed request events

- [#496](https://github.com/cloudflare/wrangler2/pull/496) [`5a640f0`](https://github.com/cloudflare/wrangler2/commit/5a640f0bcee7626cb8a969c89b8de7751d553df3) Thanks [@jahands](https://github.com/jahands)! - chore: Remove acorn/acorn-walk dependency used in Pages Functions filepath-routing.

  This shouldn't cause any functional changes, Pages Functions filepath-routing now uses esbuild to find exports.

* [#419](https://github.com/cloudflare/wrangler2/pull/419) [`04f4332`](https://github.com/cloudflare/wrangler2/commit/04f43329a252fac297bb9e8330cd934f5e96726c) Thanks [@Electroid](https://github.com/Electroid)! - refactor: use esbuild's message formatting for cleaner error messages

  This is the first step in making a standard format for error messages. For now, this uses esbuild's error formatting, which is nice and colored, but we could decide to customize our own later. Moreover, we should use the `parseJSON`, `parseTOML`, and `readFile` utilities so there are pretty errors for any configuration.

- [#501](https://github.com/cloudflare/wrangler2/pull/501) [`824d8c0`](https://github.com/cloudflare/wrangler2/commit/824d8c03adae369608a26122b0071583b2ae0674) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: delegate deprecated `preview` command to `dev` if possible

  The `preview` command is deprecated and not supported in this version of Wrangler.
  Instead, one should use the `dev` command for most `preview` use-cases.

  This change attempts to delegate any use of `preview` to `dev` failing if the command line contains positional arguments that are not compatible with `dev`.

  Resolves #9

* [#541](https://github.com/cloudflare/wrangler2/pull/541) [`371e6c5`](https://github.com/cloudflare/wrangler2/commit/371e6c581a26bd011f416de8417a2c2ca1b60097) Thanks [@threepointone](https://github.com/threepointone)! - chore: refactor some common code into `requireAuth()`

  There was a common chunk of code across most commands that ensures a user is logged in, and retrieves an account ID. I'd resisted making this into an abstraction for a while. Now that the codebase is stable, and https://github.com/cloudflare/wrangler2/pull/537 removes some surrounding code there, I made an abstraction for this common code as `requireAuth()`. This gets a mention in the changelog simply because it touches a bunch of code, although it's mostly mechanical deletion/replacement.

- [#551](https://github.com/cloudflare/wrangler2/pull/551) [`afd4b0e`](https://github.com/cloudflare/wrangler2/commit/afd4b0ed2c9fc95238b69c6fd86740243f58b049) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: do not log the `null` returned from `kv:bulk put` and `kv:bulk delete`

* [#503](https://github.com/cloudflare/wrangler2/pull/503) [`e5c7ed8`](https://github.com/cloudflare/wrangler2/commit/e5c7ed8b17033fc6a9e77a9429cb32fa54b5d8fb) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refact: consolidate on `ws` websocket library

  Removes the `faye-websocket` library and uses `ws` across the code base.

- [#502](https://github.com/cloudflare/wrangler2/pull/502) [`b30349a`](https://github.com/cloudflare/wrangler2/commit/b30349ac6b258c0c274606959d9d31bb8efb08d7) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix(pages): ensure remaining args passed to `pages dev` command are captured

  It is common to pass additional commands to `pages dev` to generate the input source.
  For example:

  ```bash
  npx wrangler pages dev -- npm run dev
  ```

  Previously the args after `--` were being dropped.
  This change ensures that these are captured and used correctly.

  Fixes #482

* [#512](https://github.com/cloudflare/wrangler2/pull/512) [`b093df7`](https://github.com/cloudflare/wrangler2/commit/b093df775cc762517666bd68361cc37c5e936a9a) Thanks [@threepointone](https://github.com/threepointone)! - feat: a better `tsconfig.json`

  This makes a better `tsconfig.json` when using `wrangler init`. Of note, it takes the default `tsconfig.json` generated by `tsc --init`, and adds our modifications.

- [#510](https://github.com/cloudflare/wrangler2/pull/510) [`9534c7f`](https://github.com/cloudflare/wrangler2/commit/9534c7fd1351daacaed63b3a3e2fafa884b515a8) Thanks [@threepointone](https://github.com/threepointone)! - feat: `--legacy-env` cli arg / `legacy_env` config

  This is the first of a few changes to codify how we do environments in wrangler2, both older legacy style environments, and newer service environments. Here, we add a cli arg and a config field for specifying whether to enable/disable legacy style environments, and pass it on to dev/publish commands. We also fix how we were generating kv namespaces for Workers Sites, among other smaller fixes.

* [#549](https://github.com/cloudflare/wrangler2/pull/549) [`3d2ce01`](https://github.com/cloudflare/wrangler2/commit/3d2ce01a48acfb759147de5d94667eef77d9f16e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: kv:bulk should JSON encode its contents

  The body passed to `kv:bulk delete` and `kv:bulk put` must be JSON encoded.
  This change fixes that and adds some tests to prove it.

  Fixes #547

- [#554](https://github.com/cloudflare/wrangler2/pull/554) [`6e5319b`](https://github.com/cloudflare/wrangler2/commit/6e5319bd7a3685afa0e0b7c3e9bb81831b89e88f) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: limit bulk delete API requests to batches of 5,000

  The `kv:bulk delete` command now batches up delete requests in groups of 5,000,
  displaying progress for each request.

* [#538](https://github.com/cloudflare/wrangler2/pull/538) [`4b6c973`](https://github.com/cloudflare/wrangler2/commit/4b6c973dfdaf44429a47c8da387f9bc706ef4664) Thanks [@threepointone](https://github.com/threepointone)! - feat: with `wrangler init`, create a new directory for named workers

  Currently, when creating a new project, we usually first have to create a directory before running `wrangler init`, since it defaults to creating the `wrangler.toml`, `package.json`, etc in the current working directory. This fix introduces an enhancement, where using the `wrangler init [name]` form creates a directory named `[name]` and initialises the project files inside it. This matches the usage pattern a little better, and still preserves the older behaviour when we're creating a worker inside existing projects.

- [#548](https://github.com/cloudflare/wrangler2/pull/548) [`e3cab74`](https://github.com/cloudflare/wrangler2/commit/e3cab749650c70c313d9e2cc645c9656ea6be036) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor: clean up unnecessary async functions

  The `readFile()` and `readConfig()` helpers do not need to be async.
  Doing so just adds complexity to their call sites.

* [#529](https://github.com/cloudflare/wrangler2/pull/529) [`9d7e946`](https://github.com/cloudflare/wrangler2/commit/9d7e946608c54ca283b74885d5d547a87c02a79b) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add more comprehensive config validation checking

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

- [#486](https://github.com/cloudflare/wrangler2/pull/486) [`ff8c9f6`](https://github.com/cloudflare/wrangler2/commit/ff8c9f6cf9f6bf2922df74ea1083d12153a64ae0) Thanks [@threepointone](https://github.com/threepointone)! - fix: remove warning if worker with a durable object doesn't have a name

  We were warning if you were trying to develop a durable object with an unnamed worker. Further, the internal api would actually throw if you tried to develop with a named worker if it wasn't already published. The latter is being fixed internally and should live soon, and this fix removes the warning completely.

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
