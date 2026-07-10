import { convertConfigToBindings } from "@cloudflare/deploy-helpers";
import {
	maybeStartOrUpdateRemoteProxySession as maybeStartOrUpdatePackageSession,
	startRemoteProxySession as startPackageSession,
} from "@cloudflare/remote-bindings";
import { getCloudflareComplianceRegion } from "@cloudflare/workers-utils";
import { readConfig } from "../config";
import { logger } from "../logger";
import type {
	RemoteProxySession,
	RemoteProxyWorker,
} from "@cloudflare/remote-bindings";
import type {
	AsyncHook,
	Binding,
	CfAccount,
	Config,
	StartDevWorkerInput,
} from "@cloudflare/workers-utils";

export { pickRemoteBindings } from "@cloudflare/remote-bindings";
export type { RemoteProxySession } from "@cloudflare/remote-bindings";

export type StartRemoteProxySessionOptions = {
	workerName?: string;
	auth?: NonNullable<StartDevWorkerInput["dev"]>["auth"];
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
};

export function startRemoteProxySession(
	bindings: StartDevWorkerInput["bindings"],
	options?: StartRemoteProxySessionOptions
): Promise<RemoteProxySession> {
	return startPackageSession(bindings, { ...options, logger });
}

type WranglerConfigObject = {
	/** The path to the wrangler config file */
	path: string;
	/** The target environment */
	environment?: string;
};

type WorkerConfigObject = {
	/** The name of the worker */
	name?: string;
	/** The Worker's bindings */
	bindings: Record<string, Binding>;
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
	/** Id of the account owning the worker */
	account_id?: Config["account_id"];
};

export async function maybeStartOrUpdateRemoteProxySession(
	wranglerOrWorkerConfigObject: WranglerConfigObject | WorkerConfigObject,
	preExistingRemoteProxySessionData?: {
		session: RemoteProxySession;
		remoteBindings: Record<string, Binding>;
		auth?: AsyncHook<CfAccount>;
	} | null,
	auth?: AsyncHook<CfAccount>
) {
	let worker: RemoteProxyWorker;
	if ("path" in wranglerOrWorkerConfigObject) {
		const config = readConfig({
			config: wranglerOrWorkerConfigObject.path,
			env: wranglerOrWorkerConfigObject.environment,
		});
		worker = {
			name: config.name ?? "worker",
			complianceRegion: getCloudflareComplianceRegion(config),
			accountId: config.account_id,
			bindings: convertConfigToBindings(config, { usePreviewIds: true }),
		};
	} else {
		worker = {
			name: wranglerOrWorkerConfigObject.name,
			bindings: wranglerOrWorkerConfigObject.bindings,
			complianceRegion: wranglerOrWorkerConfigObject.complianceRegion,
			accountId: wranglerOrWorkerConfigObject.account_id,
		};
	}

	return maybeStartOrUpdatePackageSession(
		worker,
		preExistingRemoteProxySessionData,
		{ auth, logger }
	);
}
