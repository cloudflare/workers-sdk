import path from "node:path";
import { getBasePath } from "../../paths";
import { startWorker } from "../startDevWorker";
import type { StartDevWorkerInput, Worker } from "../startDevWorker/types";

type MixedModeSession = Pick<Worker, "ready" | "setConfig"> & {
	["mixedModeConnectionString"]: MixedModeConnectionString;
};

declare const __brand: unique symbol;
export type MixedModeConnectionString = Awaited<Worker["url"]> & {
	[__brand]: "MixedModeConnectionString";
};

export async function experimental_startMixedModeSession(
	bindings: StartDevWorkerInput["bindings"]
): Promise<MixedModeSession> {
	const proxyServerWorkerEntrypoint = path.resolve(
		getBasePath(),
		"templates/mixedMode/proxyServerWorker.ts"
	);
	const { ready, setConfig, url } = await startWorker({
		entrypoint: proxyServerWorkerEntrypoint,
		dev: {
			remote: true,
		},
		bindings,
	});

	return {
		ready,
		setConfig,
		mixedModeConnectionString: (await url) as MixedModeConnectionString,
	};
}
