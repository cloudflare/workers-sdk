# vite-plugin e2e tests

This directory contains e2e tests that give more confidence that the plugin will work in real world scenarios outside the comfort of this monorepo.

In general, these tests create test projects by copying a fixture from the `fixtures` directory into a temporary directory and then installing the local builds of the plugin along with its dependencies.

## Running the tests

Simply use turbo to run the tests from the root of the monorepo.
This will also ensure that the required dependencies have all been built before running the tests.

You will need to provide CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN for the Workers AI tests to pass.

```sh
CLOUDFLARE_ACCOUNT_ID=xxxx CLOUDFLARE_API_TOKEN=yyyy pnpm test:e2e -F @cloudflare/vite-plugin
```

## Developing e2e tests

These tests use a mock npm registry where the built plugin has been published.

The registry is booted up and loaded with the local build of the plugin and its local dependencies in the global-setup.ts file that runs once at the start of the e2e test run, and the server is killed and its caches removed at the end of the test run. The mock npm registry will delegate to the standard public npm registry for non-local dependency requests (e.g. vite, typescript, etc).

There is a `seed()` helper to setup a clean copy of a fixture outside of the monorepo so that it can be isolated from any other dependencies in the project.

The simplest test looks like:

```ts
const projectPath = await seed("basic", { pm: "pnpm" });

test("can serve a Worker request", async ({ expect, seed, runLongLived }) => {
	const proc = await runLongLived("npm", "dev", projectPath);
	const url = await waitForReady(proc);
	expect(await fetchJson(url + "/api/")).toEqual({ name: "Cloudflare" });
});
```

- The `seed()` helper creates a `beforeAll()` block:
  - make a copy of the named fixture into a temporary directory,
  - updates the vite-plugin dependency in the package.json to match the local version
  - runs `npm install` (or equivalent package manager command) in the temporary project - the dependencies are installed from the mock npm registry mentioned above.
  - returns the path to the directory containing the copy (`projectPath` above)
- The `seed()` helper also creates an `afterAll()` block:
  - the temporary directory will be deleted at the end of the test.
- The `runCommand()` helper simply executes a one-shot command and resolves when it has exited. You can use this to install the dependencies of the fixture from the mock npm registry.
- The `runLongLived()` helper runs an npm script (from the package.json scripts section) and returns an object that can be used to monitor its output. The process will be killed at the end of the test.
- The `waitForReady()` helper will resolve when a `vite dev` long lived process has output a ready message, from which it will parse the url that can be fetched in the test.
- The `fetchJson()` helper makes an Undici fetch to the url parsing the response into JSON. It will retry every 250ms for up to 10 secs to minimize flakes.

## Debugging e2e tests

You can control the logging and cleanup via environment variables:

- Keep the temporary directory after the tests have completed: `CLOUDFLARE_VITE_E2E_KEEP_TEMP_DIRS=true`
- See debug logs for the tests: `NODE_DEBUG=vite-plugin:test`
- See debug logs for the mock npm registry: `NODE_DEBUG=mock-npm-registry`
- See debug logs for Vite: `DEBUG="vite:*"`
