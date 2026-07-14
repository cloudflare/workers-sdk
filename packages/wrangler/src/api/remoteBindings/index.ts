import { maybeStartOrUpdateRemoteProxySession as maybeStartOrUpdateRemoteProxySessionFromPackage } from "@cloudflare/remote-bindings";
import { getCloudflareComplianceRegion } from "@cloudflare/workers-utils";
import { readConfig } from "../../config";
import { logger } from "../../logger";
import { convertConfigBindingsToStartWorkerBindings } from "../startDevWorker";
import type {
	RemoteProxySessionData,
	WorkerConfigObject,
} from "@cloudflare/remote-bindings";
import type { AsyncHook, CfAccount } from "@cloudflare/workers-utils";

export * from "@cloudflare/remote-bindings";

type WranglerConfigObject = {
	path: string;
	environment?: string;
};

export function maybeStartOrUpdateRemoteProxySession(
	wranglerOrWorkerConfigObject: WranglerConfigObject | WorkerConfigObject,
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

	return maybeStartOrUpdateRemoteProxySessionFromPackage(
		wranglerOrWorkerConfigObject,
		preExistingRemoteProxySessionData,
		auth,
		{ logger }
	);
}
