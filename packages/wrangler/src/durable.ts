import { getMigrationsToUpload as getMigrationsToUploadBase } from "@cloudflare/deploy-helpers";
import type { CfWorkerInit, Config } from "@cloudflare/workers-utils";

export async function getMigrationsToUpload(
	scriptName: string,
	props: {
		accountId: string | undefined;
		config: Config;
		useServiceEnvironments: boolean | undefined;
		env: string | undefined;
		dispatchNamespace: string | undefined;
	}
): Promise<CfWorkerInit["migrations"]> {
	return getMigrationsToUploadBase(scriptName, props);
}
