import type { WorkerConfig } from "./plugin-config";
import type { NodeJsCompat } from "./plugins/nodejs-compat";

export type Context = Readonly<{
	getWorkerConfig(environmentName: string): WorkerConfig | undefined;
	getNodeJsCompat(environmentName: string): NodeJsCompat | undefined;
}>;
