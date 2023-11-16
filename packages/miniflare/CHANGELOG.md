# miniflare

## 3.20231030.0

### Minor Changes

- [#4324](https://github.com/cloudflare/workers-sdk/pull/4324) [`16cc2e92`](https://github.com/cloudflare/workers-sdk/commit/16cc2e923733b3c583b5bf6c40384c52fea04991) Thanks [@penalosa](https://github.com/penalosa)! - Update to [latest `workerd@1.20231030.0`](https://github.com/cloudflare/workerd/releases/tag/v1.20231030.0)

* [#4322](https://github.com/cloudflare/workers-sdk/pull/4322) [`8a25b7fb`](https://github.com/cloudflare/workers-sdk/commit/8a25b7fba94c8e9989412bc266ada307975f182d) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add `unsafeEvalBinding` option

  Add option to leverage the newly introduced [`UnsafeEval`](https://github.com/cloudflare/workerd/pull/1338) workerd binding API,
  such API is used to evaluate javascript code at runtime via the provided `eval` and `newFunction` methods.

  The API, for security reasons (as per the [workers docs](https://developers.cloudflare.com/workers/runtime-apis/web-standards/#javascript-standards)), is not to be use in production but it is intended for local purposes only such as local testing.

  To use the binding you need to specify a string value for the `unsafeEvalBinding`, such will be the name of the `UnsafeEval` bindings that will be made available in the workerd runtime.

  For example the following code shows how to set the binding with the `UNSAFE_EVAL` name and evaluate the `1+1` string:

  ```ts
  const mf = new Miniflare({
  	log,
  	modules: true,
  	script: `
        export default {
            fetch(req, env, ctx) {
                const two = env.UNSAFE_EVAL.eval('1+1');
                return new Response('two = ' + two); // returns 'two = 2'
            }
        }
    `,
  	unsafeEvalBinding: "UNSAFE_EVAL",
  });
  ```

### Patch Changes

- [#4397](https://github.com/cloudflare/workers-sdk/pull/4397) [`4f8b3420`](https://github.com/cloudflare/workers-sdk/commit/4f8b3420f93197d331491f012ff6f4626411bfc5) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: reject `Miniflare#ready` promise if `Miniflare#dispose()` called while waiting

* [#4428](https://github.com/cloudflare/workers-sdk/pull/4428) [`3637d97a`](https://github.com/cloudflare/workers-sdk/commit/3637d97a99c9d5e8d0d2b5f3adaf4bd9993265f0) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: add `miniflare` `bin` entry

  Miniflare 3 doesn't include a CLI anymore, but should log a useful error stating this when running `npx miniflare`. We had a script for this, but it wasn't correctly hooked up. :facepalm: This change makes sure the required `bin` entry exists.

- [#4321](https://github.com/cloudflare/workers-sdk/pull/4321) [`29a59d4e`](https://github.com/cloudflare/workers-sdk/commit/29a59d4e72e3ae849474325c5c93252a3f84af0d) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure `Mutex` doesn't report itself as drained if locked

  Previously, Miniflare's `Mutex` implementation would report itself as drained
  if there were no waiters, regardless of the locked state. This bug meant that
  if you called but didn't `await` `Miniflare#setOptions()`, future calls to
  `Miniflare#dispatchFetch()` (or any other asynchronous `Miniflare` method)
  wouldn't wait for the options update to apply and the runtime to restart before
  sending requests. This change ensures we wait until the mutex is unlocked before
  reporting it as drained.

* [#4307](https://github.com/cloudflare/workers-sdk/pull/4307) [`7fbe1937`](https://github.com/cloudflare/workers-sdk/commit/7fbe1937b311f36077c92814207bbb15ef3878d6) Thanks [@jspspike](https://github.com/jspspike)! - Only output ipv4 addresses when starting

- [#4400](https://github.com/cloudflare/workers-sdk/pull/4400) [`76787861`](https://github.com/cloudflare/workers-sdk/commit/767878613eda535d125539a478d488d1a42feaa1) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: cleanup temporary directory after shutting down `workerd`

  Previously on exit, Miniflare would attempt to remove its temporary directory
  before shutting down `workerd`. This could lead to `EBUSY` errors on Windows.
  This change ensures we shutdown `workerd` before removing the directory.
  Since we can only clean up on a best effort basis when exiting, it also catches
  any errors thrown when removing the directory, in case the runtime doesn't
  shutdown fast enough.

## Previous Releases

For previous Miniflare 3 releases, refer to this GitHub releases page: https://github.com/cloudflare/miniflare/releases.

For previous Miniflare 1 and 2 releases, refer to this `CHANGELOG`: https://github.com/cloudflare/miniflare/blob/master/docs/CHANGELOG.md
