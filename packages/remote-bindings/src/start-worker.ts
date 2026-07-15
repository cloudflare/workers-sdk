import { DevEnv } from "./startDevWorker/DevEnv";
import type { Binding, StartDevWorkerInput } from "@cloudflare/workers-utils";
import type { EventEmitter } from "node:events";

export type Worker = {
	ready: Promise<void>;
	url: Promise<URL>;
	dispose(): Promise<void>;
	patchConfig(config: { bindings: Record<string, Binding> }): Promise<void>;
	raw: EventEmitter & {
		proxy: {
			localServerReady: { promise: Promise<void> };
			runtimeMessageMutex: { drained(): Promise<void> };
		};
	};
};

export async function startWorker(
	options: StartDevWorkerInput
): Promise<Worker> {
	const devEnv = new DevEnv();

	return devEnv.startWorker(options);
}
