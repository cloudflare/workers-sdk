import assert from "node:assert";
import path from "node:path";
import getPort from "get-port";
import remoteBindingsWorkerPath from "worker:remoteBindings/ProxyServerWorker";
import { readConfig } from "../../config";
import { getCloudflareComplianceRegion } from "../../environment-variables/misc-variables";
import { getBasePath } from "../../paths";
import { requireApiToken, requireAuth } from "../../user";
import {
	convertConfigBindingsToStartWorkerBindings,
	startWorker,
} from "../startDevWorker";
import type { Config } from "../../config";
import type { CfAccount } from "../../dev/create-worker-preview";
import type {
	AsyncHook,
	Binding,
	StartDevWorkerInput,
	Worker,
} from "../startDevWorker/types";
import type { RemoteProxyConnectionString } from "miniflare";

export type RemoteProxySession = Pick<Worker, "ready" | "dispose"> & {
	updateBindings: (bindings: StartDevWorkerInput["bindings"]) => Promise<void>;
	remoteProxyConnectionString: RemoteProxyConnectionString;
};

export type StartRemoteProxySessionOptions = {
	workerName?: string;
	auth?: NonNullable<StartDevWorkerInput["dev"]>["auth"];
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
};

export async function startRemoteProxySession(
	bindings: StartDevWorkerInput["bindings"],
	options?: StartRemoteProxySessionOptions
): Promise<RemoteProxySession> {
	// Transform all bindings to use "raw" mode
	const rawBindings = Object.fromEntries(
		Object.entries(bindings ?? {}).map(([key, binding]) => [
			key,
			{ ...binding, raw: true },
		])
	);

	const proxyServerWorkerWranglerConfig = path.resolve(
		getBasePath(),
		"templates/remoteBindings/wrangler.jsonc"
	);

	const worker = await startWorker({
		name: options?.workerName,
		entrypoint: remoteBindingsWorkerPath,
		config: proxyServerWorkerWranglerConfig,
		compatibilityDate: "2025-04-28",
		dev: {
			remote: "minimal",
			auth: options?.auth,
			server: {
				port: await getPort(),
			},
			inspector: false,
			logLevel: "error",
		},
		bindings: rawBindings,
	});

	const remoteProxyConnectionString =
		(await worker.url) as RemoteProxyConnectionString;

	const updateBindings = async (
		newBindings: StartDevWorkerInput["bindings"]
	) => {
		// Transform all new bindings to use "raw" mode
		const rawNewBindings = Object.fromEntries(
			Object.entries(newBindings ?? {}).map(([key, binding]) => [
				key,
				{ ...binding, raw: true },
			])
		);
		await worker.patchConfig({ bindings: rawNewBindings });
	};

	return {
		ready: worker.ready,
		remoteProxyConnectionString,
		updateBindings,
		dispose: worker.dispose,
	};
}

export function pickRemoteBindings(
	bindings: Record<string, Binding>
): Record<string, Binding> {
	return Object.fromEntries(
		Object.entries(bindings ?? {}).filter(([, binding]) => {
			if (binding.type === "ai") {
				// AI is always remote
				return true;
			}

			return "experimental_remote" in binding && binding["experimental_remote"];
		})
	);
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
	bindings: NonNullable<StartDevWorkerInput["bindings"]>;
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
};

/**
 * Utility for potentially starting or updating a remote proxy session.
 *
 * @param wranglerOrWorkerConfigObject either a file path to a wrangler configuration file or an object containing the name of
 *                                 the target worker alongside its bindings.
 * @param preExistingRemoteProxySessionData the optional data of a pre-existing remote proxy session if there was one, this
 *                                          argument can be omitted or set to null if there is no pre-existing remote proxy session
 * @param auth the authentication information for establishing the remote proxy connection
 * @returns null if no existing remote proxy session was provided and one should not be created (because the worker is not
 *          defining any remote bindings), the data associated to the created/updated remote proxy session otherwise.
 */
export async function maybeStartOrUpdateRemoteProxySession(
	wranglerOrWorkerConfigObject: WranglerConfigObject | WorkerConfigObject,
	preExistingRemoteProxySessionData?: {
		session: RemoteProxySession;
		remoteBindings: Record<string, Binding>;
		auth?: CfAccount | undefined;
	} | null,
	auth?: CfAccount | undefined
): Promise<{
	session: RemoteProxySession;
	remoteBindings: Record<string, Binding>;
} | null> {
	let config: Config | undefined;
	if ("path" in wranglerOrWorkerConfigObject) {
		const wranglerConfigObject = wranglerOrWorkerConfigObject;
		config = readConfig({
			config: wranglerConfigObject.path,
			env: wranglerConfigObject.environment,
		});

		assert(config.name);

		wranglerOrWorkerConfigObject = {
			name: config.name,
			complianceRegion: getCloudflareComplianceRegion(config),
			bindings: convertConfigBindingsToStartWorkerBindings(config) ?? {},
		};
	}

	const workerConfigObject = wranglerOrWorkerConfigObject;

	const remoteBindings = pickRemoteBindings(workerConfigObject.bindings);

	const authSameAsBefore = deepStrictEqual(
		auth,
		preExistingRemoteProxySessionData?.auth
	);

	let remoteProxySession = preExistingRemoteProxySessionData?.session;

	if (!authSameAsBefore) {
		// The auth values have changed so we do need to restart a new remote proxy session

		if (preExistingRemoteProxySessionData?.session) {
			await preExistingRemoteProxySessionData.session.dispose();
		}

		remoteProxySession = await startRemoteProxySession(remoteBindings, {
			workerName: workerConfigObject.name,
			complianceRegion: workerConfigObject.complianceRegion,
			auth: getAuthHook(auth, config),
		});
	} else {
		// The auth values haven't changed so we can reuse the pre-existing session

		const remoteBindingsAreSameAsBefore = deepStrictEqual(
			remoteBindings,
			preExistingRemoteProxySessionData?.remoteBindings
		);

		// We only want to perform updates on the remote proxy session if the session's remote bindings have changed
		if (!remoteBindingsAreSameAsBefore) {
			if (!remoteProxySession) {
				if (Object.keys(remoteBindings).length > 0) {
					remoteProxySession = await startRemoteProxySession(remoteBindings, {
						workerName: workerConfigObject.name,
						complianceRegion: workerConfigObject.complianceRegion,
						auth: getAuthHook(auth, config),
					});
				}
			} else {
				// Note: we always call updateBindings even when there are zero remote bindings, in these
				//       cases we could terminate the remote session if we wanted, that's probably
				//       something to consider down the line
				await remoteProxySession.updateBindings(remoteBindings);
			}
		}
	}

	await remoteProxySession?.ready;
	if (!remoteProxySession) {
		return null;
	}
	return {
		session: remoteProxySession,
		remoteBindings,
	};
}

/**
 * Gets the auth hook to use for the remote proxy session, this is either the user provided auth
 * hook if there is one, or an ad-hoc hook created using the account_id from the user's wrangler
 * config file otherwise.
 *
 * @param auth the auth hook provided by the user if any
 * @param config the user's wrangler config if any
 * @returns the auth hook to pass to the startRemoteProxy session function if any
 */
function getAuthHook(
	auth: CfAccount | undefined,
	config: Config | undefined
): AsyncHook<CfAccount, [Pick<Config, "account_id">]> | undefined {
	if (auth) {
		return auth;
	}

	if (config?.account_id) {
		return async () => {
			return {
				accountId: await requireAuth(config),
				apiToken: requireApiToken(),
			};
		};
	}

	return undefined;
}

function deepStrictEqual(source: unknown, target: unknown): boolean {
	try {
		assert.deepStrictEqual(source, target);
		return true;
	} catch {
		return false;
	}
}
