import { join } from "node:path";
import { CancelError } from "@cloudflare/cli-shared-helpers/error";
import { runWranglerCommand } from "helpers/command";
import { readJSON } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";

/**
 * The Build Output config of the Worker that `cf deploy` deploys unless it is
 * passed `--worker`.
 */
const DEFAULT_WORKER_CONFIG_PATH =
	".cloudflare/output/v0/workers/default/worker.config.json";

/** The subset of the JSON printed by `cf workers get` that C3 relies on. */
type CfWorker = {
	subdomain?: { enabled?: boolean; url?: string };
};

/**
 * Gets the workers.dev URL of the Worker that `cf deploy` deployed.
 *
 * `cf deploy` has no machine-readable output, and capturing what it prints
 * would stop it from prompting (e.g. to register a workers.dev subdomain), so
 * the Worker named in the Build Output that it uploaded is looked up instead.
 *
 * @param projectPath The path to the project directory.
 * @param accountId The ID of the account that the Worker was deployed to.
 * @returns The Worker's workers.dev URL, if it has one.
 */
export async function getDeploymentUrl(
	projectPath: string,
	accountId: string
): Promise<string | undefined> {
	const { npx } = detectPackageManager();
	try {
		const { name } = readJSON(
			join(projectPath, DEFAULT_WORKER_CONFIG_PATH)
		) as { name: string };
		const output = await runWranglerCommand(
			[npx, "cf", "workers", "get", name],
			{
				silent: true,
				env: { CLOUDFLARE_ACCOUNT_ID: accountId },
			}
		);
		// Skip anything, such as warnings, printed around the JSON object
		const { subdomain } = JSON.parse(
			output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1)
		) as CfWorker;
		return subdomain?.enabled ? subdomain.url : undefined;
	} catch (e) {
		if (e instanceof CancelError) {
			throw e;
		}
		return undefined;
	}
}
