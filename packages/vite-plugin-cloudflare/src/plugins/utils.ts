import type { ResolvedPluginConfig } from "../plugin-config";
import type * as vite from "vite";

export class PluginContext {
	#resolvedPluginConfig?: ResolvedPluginConfig;

	get resolvedPluginConfig(): ResolvedPluginConfig {
		// TODO: replace with `assert` once we have migrated to tsdown
		if (!this.#resolvedPluginConfig) {
			throw new Error("Expected resolvedPluginConfig to be defined");
		}

		return this.#resolvedPluginConfig;
	}

	setResolvedPluginConfig(resolvedPluginConfig: ResolvedPluginConfig): void {
		this.#resolvedPluginConfig = resolvedPluginConfig;
	}

	getWorkerConfig(environmentName: string) {
		return this.resolvedPluginConfig.type === "workers"
			? this.resolvedPluginConfig.workers[environmentName]
			: undefined;
	}

	getNodeJsCompat(environmentName: string) {
		return this.resolvedPluginConfig.type === "workers"
			? this.resolvedPluginConfig.nodeJsCompatMap.get(environmentName)
			: undefined;
	}
}

export function createPlugin(
	name: string,
	pluginFactory: (ctx: PluginContext) => Omit<vite.Plugin, "name">
): (ctx: PluginContext) => vite.Plugin {
	return (ctx) => {
		return {
			name: `vite-plugin-cloudflare:${name}`,
			sharedDuringBuild: true,
			...pluginFactory(ctx),
		};
	};
}
