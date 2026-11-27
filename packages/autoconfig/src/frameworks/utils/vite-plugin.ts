import semiver from "semiver";
import { getInstalledPackageVersion } from "./packages";
import { CF_VITE_PLUGIN_VERSION_RANGE } from "./vite-plugin-version";
import type { AutoConfigTarget } from "../../context";
import type { PackageDependency } from "../../dependencies/install";

/**
 * Lists the packages a project needs to build with the Cloudflare Vite plugin.
 *
 * For cf, that's the plugin's v2 release candidates. For Wrangler, it's the latest plugin, and first
 * Vite `^6.1.0` when the project has a Vite from 6.0.0 up to 6.1.0, which the plugin doesn't support.
 *
 * @param projectPath the path of the project (used to check the installed Vite version)
 * @param target the configuration target
 * @returns The packages to install, in order
 */
export function getCloudflareVitePluginDependencies({
	projectPath,
	target,
}: {
	projectPath: string;
	target: AutoConfigTarget;
}): PackageDependency[] {
	if (target === "cf") {
		return [
			{
				name: "@cloudflare/vite-plugin",
				version: CF_VITE_PLUGIN_VERSION_RANGE,
				dev: true,
			},
		];
	}

	const viteVersion = getInstalledPackageVersion("vite", projectPath);
	return [
		...(viteVersion &&
		semiver(viteVersion, "6.0.0") >= 0 &&
		semiver(viteVersion, "6.1.0") < 0
			? [{ name: "vite", version: "^6.1.0", dev: true }]
			: []),
		{ name: "@cloudflare/vite-plugin", dev: true },
	];
}
