# E2E tests

This folder contains e2e tests for Wrangler.

## Run the tests

Run each of the e2e test files as a separately cached turbo task. This is what we run in the CI.

This is the most effective way to run the Wrangler e2e tests. If any of the tests flake, the ones that passed will be cached and will be skipped on re-runs.

```zsh
pnpm test:e2e:wrangler
```

You can also run the turbo task directly if you want more fine grained control although this is not as resilient to flakes and is less effective at caching:

```zsh
pnpm test:e2e -F wrangler -- <extra-vitest-params>
```

## Configuration

You can configure how these e2e tests are run:

- Vitest configuration
- Cloudflare credentials
- The e2e test file to run

### Vitest configuration

Any params after a `--` will be passed to the Vitest runner, so you can use this to configure the test run.

For example to update the snapshots for all Wrangler e2e tests and bail after only 1 error, you can run:

```zsh
pnpm test:e2e:wrangler -- -u --bail=1
```

### Cloudflare Credentials

Cloudflare credentials are provided to the tests by setting `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

- If you don't provide these then only the local e2e tests are executed.
- If you don't provide the "DevProd Testing" Cloudflare account (as `CLOUDFLARE_ACCOUNT_ID=8d783f274e1f82dc46744c297b015a2f`), tests that require that specific account are not executed.

To fully run the tests you should generate an API token for the "DevProd Testing" account:

```zsh
CLOUDFLARE_ACCOUNT_ID=8d783f274e1f82dc46744c297b015a2f CLOUDFLARE_API_TOKEN=<cloudflare-testing-api-token> pnpm test:e2e:wrangler
```

### Focusing on a single e2e test file

If you want to run a subset of tests (e.g. just one) while retaining the turborepo cache for the builds of the dependencies, you can provide the list of test files via the `WRANGLER_E2E_TEST_FILE` environment variable.
For example to run the C3 integration test file only:

```zsh
WRANGLER_E2E_TEST_FILE=c3-integration.test pnpm test:e2e:wrangler
```

## How tests are written

These e2e tests are designed to run the actual Wrangler binary from a temporary directory containing test files.

There is a helper class `WranglerE2ETestHelper` that will create a context in which to run the Wrangler binary from a temporary directory.
This is defined in [packages/wrangler/e2e/helpers/e2e-wrangler-test.ts](https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/e2e/helpers/e2e-wrangler-test.ts).

There are two common patterns for using this class.

- Create a new instance inside each `it()` block so that the test is isolated from other tests in the file.
- Create an instance in a `describe()` block and then use it within the contained `it()` blocks can share the context.

There are four main properties of this class:

- `tmpPath`: the temporary directory created for this instance.
- `seed()`: used to write test files to the temporary directory.
- `run()`: used to run simple Wrangler commands, such as creating a KV namespace. It returns a promise to the result of the command.
- `runLongLived()`: used to run Wrangler commands that do not exit, such as `wrangler dev` and `wrangler tail`. It returns an object that can be used to monitor and interact with the running command.

### Example of simple command test

This example shows the helper class being shared across `it()` blocks, so that each test can build on the previous one.
It is using the `seed()` method to create test files in the temporary directory.
And then uses the `run()` method to execute simple Wrangler commands and get their output.

```ts
describe("uploading Worker versions", () => {
	const workerName = generateResourceName();
	const helper = new WranglerE2ETestHelper();

	beforeAll(async () => {
		await helper.seed({
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
			`,
			"src/index.ts": dedent`
				export default {
					fetch(request) {
						return new Response("Hello World!")
					}
				}
			`,
			"package.json": dedent`
				{
					"name": "${workerName}",
					"version": "0.0.0",
					"private": true
				}
			`,
		});
	});
	it("deploy worker", async () => {
		await helper.run("wrangler deploy");
	});
	it("upload a version", async () => {
		const upload = await helper.run(
			`wrangler versions upload --message "Upload via e2e test" --tag "e2e-upload"  --x-versions`
		);
		// Check the output looks correct
		expect(normalize(upload.stdout)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded tmp-e2e-worker-00000000-0000-0000-0000-000000000000 (TIMINGS)
			Worker Version ID: 00000000-0000-0000-0000-000000000000
			To deploy this version to production traffic use the command wrangler versions deploy --experimental-versions
			Changes to non-versioned settings (config properties 'logpush' or 'tail_consumers') take effect after your next deployment using the command wrangler versions deploy --experimental-versions
			Changes to triggers (routes, custom domains, cron schedules, etc) must be applied with the command wrangler triggers deploy --experimental-versions"
	`);
	});
});
```

### Example of long-lived command test

This test is checking the `wrangler dev` command will watch files and rebuild them when changed.
It is using an instance of the helper class within the `it()` block to isolate its files from other tests.
It is using the `seed()` method to create test files in the temporary directory.
And then uses the `runLongLived()` method to execute the `wrangler dev` command and then methods on the returned object to monitor the output from the command.
In particular the `worker.waitForReady()` and `worker.waitForReload()` commands watch the stream of output from the process for text that indicates that the Worker is ready to receive requests and that the Worker has been rebuilt, respectively.

```ts
it(`can modify worker during ${cmd}`, async () => {
	const helper = new WranglerE2ETestHelper();
	await helper.seed({
		"wrangler.toml": dedent`
			name = "worker"
			main = "src/index.ts"
			compatibility_date = "2023-01-01"
			compatibility_flags = ["nodejs_compat"]

			[vars]
			KEY = "value"
		`,
		"src/index.ts": dedent`
			export default {
				fetch(request) {
					return new Response("Hello World!")
				}
			}`,
		"package.json": dedent`
			{
				"name": "worker",
				"version": "0.0.0",
				"private": true
			}
		`,
	});
	const worker = helper.runLongLived(cmd);

	const { url } = await worker.waitForReady();

	await expect(fetch(url).then((r) => r.text())).resolves.toMatchSnapshot();

	await helper.seed({
		"src/index.ts": dedent`
			export default {
				fetch(request, env) {
					return new Response("Updated Worker! " + env.KEY)
				}
			}
		`,
	});

	await worker.waitForReload();

	await expect(fetchText(url)).resolves.toMatchSnapshot();
});
```
