import assert from "node:assert";
import path from "node:path";
import getPort from "get-port";
import { readConfig } from "../../config";
import { getBasePath } from "../../paths";
import { startWorker } from "../startDevWorker";
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

export async function startMixedModeSession(
	bindings: StartDevWorkerInput["bindings"],
	options?: {
		auth?: NonNullable<StartDevWorkerInput["dev"]>["auth"];
		/** If running in a non-public compliance region, set this here. */
		complianceRegion?: Config["compliance_region"];
	}
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
			logLevel: "none",
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

/** Map containing all the potential worker mixed mode existing sessions, it maps a worker name to its mixed mode session */
const mixedModeSessionsMap = new Map<string, MixedModeSession>();

export async function maybeStartOrUpdateMixedModeSession(
	configPathOrWorkerConfig:
		| string
		| { name?: string; bindings: NonNullable<StartDevWorkerInput["bindings"]> },
	preExistingMixedModeSession?: MixedModeSession
): Promise<MixedModeSession | undefined> {
	if (typeof configPathOrWorkerConfig === "string") {
		const configPath = configPathOrWorkerConfig;
		const config = readConfig({ config: configPath });

		const { convertConfigBindingsToStartWorkerBindings } = await import(
			"../startDevWorker"
		);

		assert(config.name);

		configPathOrWorkerConfig = {
			name: config.name,
			bindings: convertConfigBindingsToStartWorkerBindings(config) ?? {},
		};
	}
	const workerConfigs = configPathOrWorkerConfig;

	const workerRemoteBindings = pickRemoteBindings(workerConfigs.bindings);

	let mixedModeSession =
		preExistingMixedModeSession ??
		(workerConfigs.name
			? mixedModeSessionsMap.get(workerConfigs.name)
			: undefined);

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

	if (workerConfigs.name && mixedModeSession) {
		mixedModeSessionsMap.set(workerConfigs.name, mixedModeSession);
	}
	await mixedModeSession?.ready;
	return mixedModeSession;
}
