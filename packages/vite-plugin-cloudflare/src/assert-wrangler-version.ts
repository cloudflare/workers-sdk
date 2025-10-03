import { createRequire } from "node:module";
import { compare, Range, satisfies, SemVer } from "semver";

/**
 * Asserts that the installed version of Wrangler that gets pulled in at runtime by the `@cloudflare/vite-plugin`
 * matches the version that `@cloudflare/vite-plugin` actually depends upon.
 *
 * This can sometime be broken by package managers that deduplicate dependencies, such as `pnpm`.
 */
export function assertWranglerVersion() {
	const require = createRequire(import.meta.url);
	const installedVersion = new SemVer(require("wrangler/package.json").version);
	const vitePackage = require("@cloudflare/vite-plugin/package.json");

	if (vitePackage.dependencies.wrangler.startsWith("workspace:")) {
		// We are running in the monorepo, so these deps are not yet computed to specific semver strings.
		// We don't need to worry in this case and can skip the check.
		return;
	}

	const wranglerDependency = new SemVer(vitePackage.dependencies.wrangler);
	const wranglerPeerDependency = new Range(
		vitePackage.peerDependencies.wrangler
	);

	if (compare(installedVersion, wranglerDependency) < 0) {
		throw new Error(
			`The installed version of Wrangler (${installedVersion.format()}) is older than the version required by @cloudflare/vite-plugin (${wranglerDependency.format()}).\n` +
				`Please upgrade your installation of Wrangler to at least ${wranglerDependency}.`
		);
	}

	if (!satisfies(installedVersion, wranglerPeerDependency)) {
		console.warn(
			`The installed version of Wrangler (${installedVersion.format()}) does not satisfy the peer dependency required by @cloudflare/vite-plugin (${wranglerDependency.format()}).\n` +
				`This may lead to unexpected issues when you come to deploy the application.\n` +
				`Please install a version of Wrangler that satisfies the peer dependency: ${wranglerPeerDependency}.`
		);
	}
}
