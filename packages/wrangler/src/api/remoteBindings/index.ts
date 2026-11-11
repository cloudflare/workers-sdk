import { maybeStartOrUpdateRemoteProxySession as maybeStartOrUpdateRemoteProxySessionFromPackage } from "@cloudflare/remote-bindings";
import { getCloudflareComplianceRegion } from "@cloudflare/workers-utils";
import { readConfig } from "../../config";
import { logger } from "../../logger";
import { isCfAuthActive } from "../../user";
import { convertConfigBindingsToStartWorkerBindings } from "../startDevWorker";
import { getDefaultRemoteBindingsAuth } from "./auth";
import { startRemoteProxySession } from "./start-remote-proxy-session";
import type {
	RemoteProxySessionData,
	WorkerConfigObject,
} from "@cloudflare/remote-bindings";
import type { AsyncHook, CfAccount, Config } from "@cloudflare/workers-utils";

export * from "@cloudflare/remote-bindings";
export { startRemoteProxySession } from "./start-remote-proxy-session";
export type { StartRemoteProxySessionOptions } from "./start-remote-proxy-session";

type WranglerConfigObject = {
	path: string;
	environment?: string;
};

type WranglerWorkerConfigObject = WorkerConfigObject & {
	/** ID of the account owning the worker. Used when `auth` isn't passed. */
	account_id?: Config["account_id"];
	/** Directory used to resolve the auth profile when `auth` isn't passed. */
	profileDir?: string;
};

export function maybeStartOrUpdateRemoteProxySession(
	wranglerOrWorkerConfigObject:
		| WranglerConfigObject
		| WranglerWorkerConfigObject,
	preExistingRemoteProxySessionData?: RemoteProxySessionData | null,
	auth?: AsyncHook<CfAccount>
) {
	if ("path" in wranglerOrWorkerConfigObject) {
		const config = readConfig({
			config: wranglerOrWorkerConfigObject.path,
			env: wranglerOrWorkerConfigObject.environment,
		});
		wranglerOrWorkerConfigObject = {
			name: config.name ?? "worker",
			bindings: convertConfigBindingsToStartWorkerBindings(config) ?? {},
			complianceRegion: getCloudflareComplianceRegion(config),
			account_id: config.account_id,
		};
	}

	const { account_id, profileDir, ...workerConfigObject } =
		wranglerOrWorkerConfigObject;
	return maybeStartOrUpdateRemoteProxySessionFromPackage(
		workerConfigObject,
		preExistingRemoteProxySessionData,
		auth ?? getDefaultRemoteBindingsAuth(account_id, profileDir),
		{ cliDisplayName: isCfAuthActive() ? "cf" : "Wrangler", logger },
		startRemoteProxySession
	);
}
