import { fetchResult } from "../cfetch";
import { Config } from "../config";
import { requireAuth } from "../user";
import { isLegacyEnv } from "./isLegacyEnv";

export async function fetchSecrets(
	config: Config,
	environment?: string
): Promise<{ name: string; type: string }[]> {
	const accountId = await requireAuth(config);

	const url =
		!environment || isLegacyEnv(config)
			? `/accounts/${accountId}/workers/scripts/${config.name}/secrets`
			: `/accounts/${accountId}/workers/services/${config.name}/environments/${environment}/secrets`;

	const secrets = await fetchResult<{ name: string; type: string }[]>(url);

	return secrets;
}
