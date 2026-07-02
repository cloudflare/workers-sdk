import {
	getMigrationsToUpload as getMigrationsToUploadBase,
	resolveDoLifecyclePayload as resolveDoLifecyclePayloadBase,
} from "@cloudflare/deploy-helpers";
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

export async function resolveDoLifecyclePayload(props: {
	scriptName: string;
	isDryRun: boolean | undefined;
	accountId: string | undefined;
	config: Config;
	useServiceEnvironments: boolean | undefined;
	env: string | undefined;
	dispatchNamespace: string | undefined;
}): Promise<{
	migrations: CfWorkerInit["migrations"];
	exports: CfWorkerInit["exports"];
}> {
	return resolveDoLifecyclePayloadBase(props);
}
