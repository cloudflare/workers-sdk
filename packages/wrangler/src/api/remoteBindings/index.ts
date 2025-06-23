import assert from "node:assert";
import path from "node:path";
import getPort from "get-port";
import { readConfig } from "../../config";
import { getBasePath } from "../../paths";
import {
	convertConfigBindingsToStartWorkerBindings,
	startWorker,
} from "../startDevWorker";
import type { Config } from "../../config";
import type {
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
	const proxyServerWorkerWranglerConfig = path.resolve(
		getBasePath(),
		"templates/remoteBindings/proxyServerWorker/wrangler.jsonc"
	);

	// Transform all bindings to use "raw" mode
	const rawBindings = Object.fromEntries(
		Object.entries(bindings ?? {}).map(([key, binding]) => [
			key,
			{ ...binding, raw: true },
		])
	);

	const worker = await startWorker({
		name: options?.workerName,
		config: proxyServerWorkerWranglerConfig,
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

/**
 * Utility for potentially starting or updating a remote proxy session.
 *
 * It uses an internal map for storing existing remote proxy session indexed by worker names. If no worker name is provided
 * the remote proxy session won't be retrieved nor saved to/from the internal map.
 *
 * @param configPathOrWorkerConfig either a file path to a wrangler configuration file or an object containing the name of
 *                                 the target worker alongside its bindings.
 * @param preExistingRemoteProxySessionData the optional data of a pre-existing remote proxy session if there was one, this
 *                                          argument can be omitted or set to null if there is no pre-existing remote proxy session
 * @returns null if no existing remote proxy session was provided and one should not be created (because the worker is not
 *          defining any remote bindings), the data associated to the created/updated remote proxy session otherwise.
 */
export async function maybeStartOrUpdateRemoteProxySession(
	configPathOrWorkerConfig:
		| string
		| {
				name?: string;
				bindings: NonNullable<StartDevWorkerInput["bindings"]>;
		  },
	preExistingRemoteProxySessionData?: {
		session: RemoteProxySession;
		remoteBindings: Record<string, Binding>;
	} | null
): Promise<{
	session: RemoteProxySession;
	remoteBindings: Record<string, Binding>;
} | null> {
	if (typeof configPathOrWorkerConfig === "string") {
		const configPath = configPathOrWorkerConfig;
		const config = readConfig({ config: configPath });

		assert(config.name);

		configPathOrWorkerConfig = {
			name: config.name,
			bindings: convertConfigBindingsToStartWorkerBindings(config) ?? {},
		};
	}
	const workerConfigs = configPathOrWorkerConfig;

	const remoteBindings = pickRemoteBindings(workerConfigs.bindings);

	let remoteProxySession = preExistingRemoteProxySessionData?.session;

	const remoteBindingsAreSameAsBefore = deepStrictEqual(
		remoteBindings,
		preExistingRemoteProxySessionData?.remoteBindings
	);

	// We only want to perform updates on the remote proxy session if the session's remote bindings have changed
	if (!remoteBindingsAreSameAsBefore) {
		if (!remoteProxySession) {
			if (Object.keys(remoteBindings).length > 0) {
				remoteProxySession = await startRemoteProxySession(remoteBindings);
			}
		} else {
			// Note: we always call updateBindings even when there are zero remote bindings, in these
			//       cases we could terminate the remote session if we wanted, that's probably
			//       something to consider down the line
			await remoteProxySession.updateBindings(remoteBindings);
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

function deepStrictEqual(source: unknown, target: unknown): boolean {
	try {
		assert.deepStrictEqual(source, target);
		return true;
	} catch {
		return false;
	}
}
