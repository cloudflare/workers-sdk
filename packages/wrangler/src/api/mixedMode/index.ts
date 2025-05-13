import path from "node:path";
import getPort from "get-port";
import { getBasePath } from "../../paths";
import { startWorker } from "../startDevWorker";
import type { StartDevWorkerInput, Worker } from "../startDevWorker/types";
import type { MixedModeConnectionString } from "miniflare";

type BindingsOpt = StartDevWorkerInput["bindings"];

export type MixedModeSession = Pick<Worker, "ready" | "dispose"> & {
	["setConfig"]: (bindings: BindingsOpt) => Promise<void>;
	["mixedModeConnectionString"]: MixedModeConnectionString;
};

export async function startMixedModeSession(
	bindings: BindingsOpt,
	options?: {
		auth: NonNullable<StartDevWorkerInput["dev"]>["auth"];
	}
): Promise<MixedModeSession> {
	const proxyServerWorkerWranglerConfig = path.resolve(
		getBasePath(),
		"templates/mixedMode/proxyServerWorker/wrangler.jsonc"
	);

	const worker = await startWorker({
		config: proxyServerWorkerWranglerConfig,
		dev: {
			remote: true,
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
		},
		bindings,
	});

	const mixedModeConnectionString =
		(await worker.url) as MixedModeConnectionString;

	const setConfig = async (newBindings: BindingsOpt) => {
		await worker.setConfig({ bindings: newBindings });
	};

	return {
		ready: worker.ready,
		mixedModeConnectionString,
		setConfig,
		dispose: worker.dispose,
	};
}
