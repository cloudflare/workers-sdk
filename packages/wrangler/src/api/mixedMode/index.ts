import path from "node:path";
import { getBasePath } from "../../paths";
import { startWorker } from "../startDevWorker";
import type { StartDevWorkerInput, Worker } from "../startDevWorker/types";
import type { MixedModeConnectionString } from "miniflare";

type BindingsOpt = StartDevWorkerInput["bindings"];

type MixedModeSession = Pick<Worker, "ready" | "dispose"> & {
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
