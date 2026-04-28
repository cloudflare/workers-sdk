import { brandColor, dim } from "@cloudflare/cli-shared-helpers/colors";
import { installPackages } from "@cloudflare/cli-shared-helpers/packages";
import semiver from "semiver";
import { getInstalledPackageVersion } from "./packages";
import type { PackageManager } from "../../../package-manager";

/**
 * Installs the `@cloudflare/vite-plugin` package as a dev dependency
 *
 * If the project has Vite >= 6.0.0 but < 6.1.0 installed, it will first
 * be updated to `^6.1.0` to ensure compatibility with the plugin.
 *
 * @param packageManager the type of package manager to use for installation
 * @param projectPath the path of the project (used to check the installed Vite version)
 * @param isWorkspaceRoot whether the current project is a workspace root
 */
export async function installCloudflareVitePlugin({
	packageManager,
	projectPath,
	isWorkspaceRoot,
}: {
	packageManager: PackageManager["type"];
	projectPath: string;
	isWorkspaceRoot: boolean;
}): Promise<void> {
	const viteVersion = getInstalledPackageVersion("vite", projectPath);

	if (
		viteVersion &&
		semiver(viteVersion, "6.0.0") >= 0 &&
		semiver(viteVersion, "6.1.0") < 0
	) {
		// If the vite version is between 6.0.0 and 6.1.0 lets bump it to
		// the latest version of 6.x, in this way it will be compatible
		// with the vite plugin (likely without causing any inconvenience)
		await installPackages(packageManager, ["vite@^6.1.0"], {
			dev: true,
			startText:
				"Updating the version of vite to be compatible with the Cloudflare Vite Plugin",
			doneText: `${brandColor(`updated`)} ${dim("Vite")}`,
			isWorkspaceRoot,
		});
	}

	await installPackages(packageManager, ["@cloudflare/vite-plugin"], {
		dev: true,
		startText: "Installing the Cloudflare Vite plugin",
		doneText: `${brandColor(`installed`)} ${dim("@cloudflare/vite-plugin")}`,
		isWorkspaceRoot,
	});
}
