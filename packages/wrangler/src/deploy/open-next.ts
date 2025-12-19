import assert from "node:assert";
import { readdir } from "node:fs/promises";
import { getOpenNextDeployFromEnv } from "@cloudflare/workers-utils";
import { runCommand } from "../autoconfig/c3-vendor/command";
import { getInstalledPackageVersion } from "../autoconfig/frameworks/utils/packages";
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
	projectRoot: string
): Promise<boolean> {
	if (await isOpenNextProject(projectRoot)) {
		const openNextDeploy = getOpenNextDeployFromEnv();
		if (!openNextDeploy) {
			logger.log(
				"OpenNext project detected, calling `opennextjs-cloudflare deploy`"
			);

			const deployArgIdx = process.argv.findIndex((arg) => arg === "deploy");
			assert(deployArgIdx !== -1, "Could not find `deploy` argument");
			const deployArguments = process.argv.slice(deployArgIdx + 1);

			const { npx } = await getPackageManager();

			await runCommand(
				[npx, "opennextjs-cloudflare", "deploy", ...deployArguments],
				{
					env: {
						// We set `OPEN_NEXT_DEPLOY` here so that it's passed through to the `wrangler deploy` command that OpenNext delegates to in order to prevent an infinite loop
						OPEN_NEXT_DEPLOY: "true",
					},
				}
			);

			return true;
		}
	}
	return false;
}

/**
 * Discerns if the project is an open-next one. This check is performed in an assertive way to ensure that
 * no false positives happen.
 *
 * @param projectRoot The path to the project's root
 * @returns true if the project is an open-next one, false otherwise
 */
async function isOpenNextProject(projectRoot: string) {
	try {
		const dirFiles = await readdir(projectRoot);

		const nextConfigFile = dirFiles.find((file) =>
			/^next\.config\.(m|c)?(ts|js)$/.test(file)
		);

		if (!nextConfigFile) {
			// If there is no next config file then the project is not a Next.js one
			return false;
		}

		const opeNextConfigFile = dirFiles.find((file) =>
			/^open-next\.config\.(ts|js)$/.test(file)
		);

		if (!opeNextConfigFile) {
			// If there is no open-next config file then the project is not an OpenNext one
			return false;
		}

		const openNextVersion = getInstalledPackageVersion(
			"@opennextjs/cloudflare",
			projectRoot,
			{
				// We stop at the projectPath/root just to make extra sure we don't hit false positives
				stopAtProjectPath: true,
			}
		);

		return openNextVersion !== undefined;
	} catch {
		// If any error is thrown then we simply assume that we're not running in an OpenNext project
		return false;
	}
}
