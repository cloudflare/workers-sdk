# mock-npm-registry

This internal package can be used in tests by othe packages to set up a mock local npm registry, publish locally built copies of the packages and their dependencies, then install those packages into test fixtures.

## Usage

A good example is the vitest-pool-workers e2e tests. See packages/vitest-pool-workers/test/global-setup.ts

```ts
export default async function ({ provide }: GlobalSetupContext) {
	const stop = await startMockNpmRegistry("@cloudflare/vitest-pool-workers");

	// Create temporary directory
	const projectPath = await createTestProject();
	execSync("pnpm install", { cwd: projectPath, stdio: "ignore" });

	provide("tmpPoolInstallationPath", projectPath);
```

Here you can see that in Vitest global setup file, we are calling `startMockNpmRegistry()`.
We pass in the `@cloudflare/vitest-pool-workers` package name, which will ensure that this package
(and all its local dependencies, such as Wrangler, Miniflare, etc) is built and published to the mock registry.

We then create a temporary test project that has a dependency on `@cloudflare/vitest-pool-workers`
and then run `pnpm install`, which will install the locally published packages.

The path to this temporary test project is provided to tests.

## Debugging

If you are having problems with the mock npm registry, you can get additional debug logging by setting the `NODE_DEBUG` environment variable.

```env
NODE_DEBUG=mock-npm-registry
```
