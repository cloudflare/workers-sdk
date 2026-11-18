# mock-npm-registry

This internal package can be used in tests by othe packages to set up a mock local npm registry, publish locally built copies of the packages and their dependencies, then install those packages into test fixtures.

## Usage

A good example is the vitest-plugin e2e tests. See packages/vitest-plugin/test/global-setup.ts

```ts
export default async function ({ provide }: GlobalSetupContext) {
	const stop = await startMockNpmRegistry("@cloudflare/vitest-plugin");

	// Create temporary directory
	const projectPath = await createTestProject();
	execSync("pnpm install", { cwd: projectPath, stdio: "ignore" });

	provide("tmpPoolInstallationPath", projectPath);
```

Here you can see that in Vitest global setup file, we are calling `startMockNpmRegistry()`.
We pass in the `@cloudflare/vitest-plugin` package name, which will ensure that this package
(and all its local dependencies, such as Wrangler, Miniflare, etc) is built and published to the mock registry.

We then create a temporary test project that has a dependency on `@cloudflare/vitest-plugin`
and then run `pnpm install`, which will install the locally published packages.

The path to this temporary test project is provided to tests.

Packages with a `workers-sdk.npmPrerelease.tag` setting in their `package.json`
are published under that dist-tag, such as `beta`. Other packages use `latest`.
This lets tests install the local `@cloudflare/vite-plugin@beta` while stable
Vite plugin versions remain available through the public npm registry.

### Versions of local dependencies

Only the packages passed to `startMockNpmRegistry()` are published under their
real versions. Their local dependencies are published as `0.0.0-local.<version>`
prereleases, such as `@cloudflare/config@0.0.0-local.0.32.1` or
`miniflare@0.0.0-local.5.20261113.0-beta`, with the `local` dist-tag. The local
packages depend on each other by these exact versions.

This is because an unreleased workspace package has the same version as its
latest npm release. A package installed from npm that depends on that exact
version, such as a published `cf` pinning `@cloudflare/config`, would otherwise
get the local copy, with any unreleased breaking changes. Instead it gets the
copy from npm, and so do `<name>@latest` and ranges such as `^0.32.1` or
`^5.20261113.0-beta`. (A suffix such as `5.20261113.0-beta.local` wouldn't be
enough, since prerelease ranges match later prereleases of the same version.)

If a test installs a local package directly by version or dist-tag (for
example `wrangler@latest`), pass that package to `startMockNpmRegistry()` too.

The repository's files aren't modified. Each package is packed with `pnpm pack`,
which resolves `workspace:*` dependencies to exact versions, and its packed
`package.json` is rewritten before publishing. Local packages must depend on
each other with `workspace:*`.

## Debugging

If you are having problems with the mock npm registry, you can get additional debug logging by setting the `NODE_DEBUG` environment variable.

```env
NODE_DEBUG=mock-npm-registry
```
