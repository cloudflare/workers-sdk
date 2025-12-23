import { APIError } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import { useServiceEnvironments } from "./useServiceEnvironments";
import type { Config } from "@cloudflare/workers-utils";

export async function fetchSecrets(
	config: Config,
	environment?: string
): Promise<{ name: string; type: string }[]> {
	const accountId = await requireAuth(config);

	const isServiceEnv = environment && useServiceEnvironments(config);

	const scriptName = config.name;

	const url = isServiceEnv
		? `/accounts/${accountId}/workers/services/${scriptName}/environments/${environment}/secrets`
		: `/accounts/${accountId}/workers/scripts/${scriptName}/secrets`;

	const secrets = await fetchResult<{ name: string; type: string }[]>(
		config,
		url
	).catch((e) => {
		if (e instanceof APIError && e.code === 10007) {
			// The worker was not found this means that this is the workers' first deployment
			// so there are obviously no secrets
			return [];
		}

		throw e;
	});

	return secrets;
}
