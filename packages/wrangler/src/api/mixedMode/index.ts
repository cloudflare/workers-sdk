import path from "node:path";
import getPort from "get-port";
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
