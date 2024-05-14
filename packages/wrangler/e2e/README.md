# E2E tests

This folder contains e2e tests for Wrangler. The tests run in CI against a specific Cloudflare account.

You can also run these tests locally, but you'll need access to the `8d783f274e1f82dc46744c297b015a2f` (DevProd Testing) Cloudflare account. Once you have access, generate an API token for the account with the same scopes Wrangler requests.

You can then run the e2e test suite with the below command (run this in the `packages/wrangler` folder):

```sh
    CLOUDFLARE_ACCOUNT_ID=8d783f274e1f82dc46744c297b015a2f CLOUDFLARE_API_TOKEN=$CLOUDFLARE_TESTING_API_TOKEN WRANGLER="node --no-warnings $PWD/wrangler-dist/cli.js" WRANGLER_IMPORT="$PWD/wrangler-dist/cli.js" pnpm run test:e2e --retry 0
```

> Make sure to replace `$CLOUDFLARE_TESTING_API_TOKEN` with the actual API token you generated, and make sure you've built Wrangler (with `pnpm build`).

## How tests are written

The main thing to keep in mind is that tests should be written with the custom `e2eTest()` test fixture (see https://vitest.dev/guide/test-context.html#test-extend for more details). This is defined in https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/e2e/helpers/e2e-wrangler-test.ts, and is used to defined tests exactly as you'd use Vitest's default `test()` function:

```ts
e2eTest("can fetch worker", async ({ run, seed }) => {
	await seed({
		"wrangler.toml": dedent`
                name = "worker"
                main = "src/index.ts"
                compatibility_date = "2023-01-01"
        `,
		"src/index.ts": dedent/* javascript */ `
            export default{
                fetch() {
                    return new Response("hello world");
                },
            };
        `,
		"package.json": dedent`
            {
                "name": "worker",
                "version": "0.0.0",
                "private": true
            }
            `,
	});
	const worker = run("wrangler dev");

	const { url } = await waitForReady(worker);

	await expect(fetch(url).then((r) => r.text())).resolves.toMatchInlineSnapshot(
		'"hello world"'
	);
});
```

The above code snippet demonstrates the two main features of the `e2eTest()` fixture: `run()` and `seed()`. The `e2eTest()` fixture also provisions a temporary directory for each test run, which both `seed()` and `run()` use.

### `seed()`

This command allows you to seed the filesystem for a test run. It takes a single argument representing an object mapping from (relative) file paths to file contents.

### `run()`

`run()` is the way to run a Wrangler command. It takes two parameters:

- `cmd: string` This is the command that will be run. It must start with the string `wrangler` (which will be replaced with the path to the actual Wrangler executable, depending on how the e2e tests are being run).
- `options: { debug, env, cwd }`:
  - `debug` turns on Wrangler's debug log level, which can be helpful when asserting against Wrangler's output
  - `env` sets the environment for the Wrangler command (it defaults to `process.env`)
  - `cwd` sets the folder in which the Wrangler command will be run (it defaults to the temporary directory that `e2eTest()` provisions)

Depending on the type of Wrangler command you're running, there are two ways to use `run()`:

1. If the Wrangler command is expected to exit quickly (i.e. `wrangler deploy`), you can await the call to `run()` (i.e. `await run("wrangler deploy")`). This will resolve with the string output resulting from running `cmd` (mixed `stdout` and `stderr`)
2. If the Wrangler command is expected to be long-running, you can instead call `run()` _without_ `await`-ing it. See `e2e/dev.test.ts` for examples of this.
