import type { WorkerConfig } from "../plugin-config";
import type { NodeJsCompat } from "./nodejs-compat";
import type * as vite from "vite";

type Context = Readonly<{
	getWorkerConfig(environmentName: string): WorkerConfig | undefined;
	getNodeJsCompat(environmentName: string): NodeJsCompat | undefined;
}>;

export function createPlugin(
	name: string,
	pluginFactory: (ctx: Context) => Omit<vite.Plugin, "name">
): (ctx: Context) => vite.Plugin {
	return (ctx) => {
		return {
			name: `vite-plugin-cloudflare:${name}`,
			...pluginFactory(ctx),
		};
	};
}
