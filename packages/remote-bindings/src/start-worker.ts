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

export function startWorker(_input: StartDevWorkerInput): Promise<Worker> {
	throw new Error("startWorker() is not implemented");
}
