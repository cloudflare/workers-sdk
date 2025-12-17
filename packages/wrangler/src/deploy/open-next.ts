import { getOpenNextDeployFromEnv } from "@cloudflare/workers-utils";
import { runCommand } from "../autoconfig/c3-vendor/command";
import { getInstalledPackageVersion } from "../autoconfig/frameworks";
import { logger } from "../logger";
import { getPackageManager } from "../package-manager";

/**
 * If appropriate (when `wrangler deploy` is run in an OpenNext project without setting the `OPEN_NEXT_DEPLOY` environment variable)
 * this function delegates the deployment operation to `@opennextjs/cloudflare`, otherwise it does nothing.
 *
 * @param projectRoot The path to the project's root
 * @returns true is the deployment has been delegated to open-next, false otherwise
 */
export async function maybeDelegateToOpenNextDeployCommand(
	projectRoot: string | undefined
): Promise<boolean> {
	const openNextVersion =
		projectRoot &&
		getInstalledPackageVersion("@opennextjs/cloudflare", projectRoot);

	const isOpenNextProject = openNextVersion !== undefined;

	if (isOpenNextProject) {
		const openNextDeploy = getOpenNextDeployFromEnv();
		if (!openNextDeploy) {
			logger.log(
				"OpenNext project detected, calling `opennextjs-cloudflare deploy`"
			);

			const { npx } = await getPackageManager();

			await runCommand([npx, "opennextjs-cloudflare", "deploy"], {
				env: {
					// We set `OPEN_NEXT_DEPLOY` here so that it's passed through to the `wrangler deploy` command that OpenNext delegates to in order to prevent an infinite loop
					OPEN_NEXT_DEPLOY: "true",
				},
			});

			return true;
		}
	}
	return false;
}
