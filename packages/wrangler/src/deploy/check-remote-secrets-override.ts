import { checkRemoteSecretsOverride as checkRemoteSecretsOverrideBase } from "@cloudflare/deploy-helpers";
import { requireAuth } from "../user";
import type { Config } from "@cloudflare/workers-utils";

export async function checkRemoteSecretsOverride(
	config: Config,
	targetEnv?: string
) {
	const accountId = await requireAuth(config);
	return checkRemoteSecretsOverrideBase(config, accountId, targetEnv);
}
