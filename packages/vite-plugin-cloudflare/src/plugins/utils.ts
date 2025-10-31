import type { ResolvedPluginConfig } from "../plugin-config";
import type * as vite from "vite";

export class PluginContext {
	#localState: {
		resolvedPluginConfig?: ResolvedPluginConfig;
		resolvedViteConfig?: vite.ResolvedConfig;
	} = {};

	resetLocalState(): void {
		this.#localState = {};
	}

	setResolvedPluginConfig(resolvedPluginConfig: ResolvedPluginConfig): void {
		this.#localState.resolvedPluginConfig = resolvedPluginConfig;
	}

	setResolvedViteConfig(resolvedViteConfig: vite.ResolvedConfig): void {
		this.#localState.resolvedViteConfig = resolvedViteConfig;
	}

	get resolvedPluginConfig(): ResolvedPluginConfig {
		// TODO: replace with `assert` once we have migrated to tsdown
		if (!this.#localState.resolvedPluginConfig) {
			throw new Error("Expected resolvedPluginConfig to be defined");
		}

		return this.#localState.resolvedPluginConfig;
	}

	get resolvedViteConfig(): vite.ResolvedConfig {
		// TODO: replace with `assert` once we have migrated to tsdown
		if (!this.#localState.resolvedViteConfig) {
			throw new Error("Expected resolvedViteConfig to be defined");
		}

		return this.#localState.resolvedViteConfig;
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
