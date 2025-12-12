import { satisfies } from "semver";

/**
 * Asserts that the installed version of Wrangler that gets pulled in at runtime by the `@cloudflare/vite-plugin`
 * matches the version that `@cloudflare/vite-plugin` actually depends upon.
 *
 * This can sometime be broken by package managers that deduplicate dependencies, such as `pnpm`.
 */
export async function assertWranglerVersion() {
	const installedVersion = (
		await import("wrangler/package.json", {
			with: { type: "json" },
		})
	).default.version;

	const ourPackageJson = (
		await import("../package.json", {
			with: { type: "json" },
		})
	).default;

	const peerDependency = ourPackageJson.peerDependencies.wrangler;

	if (peerDependency.startsWith("workspace:")) {
		// We are running in the monorepo, so these deps are not yet computed to specific semver strings.
		// We don't need to worry in this case and can skip the check.
		return;
	}

	if (!satisfies(installedVersion, peerDependency)) {
		throw new Error(
			`The installed version of Wrangler (${installedVersion}) does not satisfy the peer dependency required by @cloudflare/vite-plugin (${peerDependency}).\n` +
				`Please install wrangler@${peerDependency}.`
		);
	}
}
