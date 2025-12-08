import { runCommand } from "../autoconfig/c3-vendor/command";
import { getInstalledPackageVersion } from "../autoconfig/frameworks";
import { logger } from "../logger";
import { getPackageManager } from "../package-manager";

/**
 * Delegates the deployment to `@opennextjs/cloudflare`.
 *
 * Why?
 *  `wrangler deploy` shouldn't be run on an open-next project, since open-next has its own deploy command,
 *  in the interest in having things "just work" we updated `wrangler deploy` to delegate to the open-next
 *  deploy command, so that, if a developer runs `npx wrangler deploy` (e.g. like in Workers Builds) on an
 *  open-next project that will work just fine.
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
		// eslint-disable-next-line turbo/no-undeclared-env-vars
		const openNextDeploy = process.env["OPEN_NEXT_DEPLOY"];
		if (!openNextDeploy) {
			logger.log(
				"The project seems to be an open-next one, calling `opennextjs-cloudflare deploy`"
			);

			const { npx } = await getPackageManager();

			await runCommand([npx, "opennextjs-cloudflare", "deploy"], {
				env: {
					// Note: we set `OPEN_NEXT_DEPLOY` just in case to make sure that even if open-next stops
					//       setting the variable we set it for it here (note: open-next does forward env variable
					//       to its `wrangler deploy` call)
					OPEN_NEXT_DEPLOY: "true",
				},
			});

			return true;
		}
	}
	return false;
}
