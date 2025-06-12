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
import type { MixedModeConnectionString } from "miniflare";

export type MixedModeSession = Pick<Worker, "ready" | "dispose"> & {
	updateBindings: (bindings: StartDevWorkerInput["bindings"]) => Promise<void>;
	mixedModeConnectionString: MixedModeConnectionString;
};

export type StartMixedModeSessionOptions = {
	workerName?: string;
	auth?: NonNullable<StartDevWorkerInput["dev"]>["auth"];
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
};

export async function startMixedModeSession(
	bindings: StartDevWorkerInput["bindings"],
	options?: StartMixedModeSessionOptions
): Promise<MixedModeSession> {
	const proxyServerWorkerWranglerConfig = path.resolve(
		getBasePath(),
		"templates/mixedMode/proxyServerWorker/wrangler.jsonc"
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
			// TODO(DEVX-1861): we set this to a random port so that it doesn't conflict with the
			//                  default one, we should ideally add an option to actually disable
			//                  the inspector
			inspector: {
				port: await getPort(),
			},
			logLevel: "error",
		},
		bindings: rawBindings,
	});

	const mixedModeConnectionString =
		(await worker.url) as MixedModeConnectionString;

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
		mixedModeConnectionString,
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

			return "remote" in binding && binding["remote"];
		})
	);
}

/**
 * Utility for potentially starting or updating a mixed mode session.
 *
 * It uses an internal map for storing existing mixed mode session indexed by worker names. If no worker name is provided
 * the mixed mode session won't be retrieved nor saved to/from the internal map.
 *
 * @param configPathOrWorkerConfig either a file path to a wrangler configuration file or an object containing the name of
 *                                 the target worker alongside its bindings.
 * @param preExistingMixedModeSession an pre-existing mixed mode session to use or null if there is no such session
 * @returns null if no existing mixed mode session was provided and one should not be created (because the worker is not
 *          defining any remote bindings), the created/updated mixed mode session otherwise.
 */
export async function maybeStartOrUpdateMixedModeSession(
	configPathOrWorkerConfig:
		| string
		| { name?: string; bindings: NonNullable<StartDevWorkerInput["bindings"]> },
	preExistingMixedModeSession: MixedModeSession | null
): Promise<MixedModeSession | null> {
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

	const workerRemoteBindings = pickRemoteBindings(workerConfigs.bindings);

	let mixedModeSession = preExistingMixedModeSession;

	// TODO(DEVX-1893): here we can save the converted remote bindings
	//             and on new iterations we can diff the old and new
	//             converted remote bindings, if they are all the
	//             same we can just leave the mixedModeSession untouched
	if (!mixedModeSession) {
		if (Object.keys(workerRemoteBindings).length > 0) {
			mixedModeSession = await startMixedModeSession(workerRemoteBindings);
		}
	} else {
		// Note: we always call updateBindings even when there are zero remote bindings, in these
		//       cases we could terminate the remote session if we wanted, that's probably
		//       something to consider down the line
		await mixedModeSession.updateBindings(workerRemoteBindings);
	}

	await mixedModeSession?.ready;
	return mixedModeSession;
}
