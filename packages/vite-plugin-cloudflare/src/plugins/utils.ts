import assert from "node:assert";
import { Miniflare } from "miniflare";
import { debuglog } from "../utils";
import type { ResolvedPluginConfig } from "../plugin-config";
import type { MiniflareOptions } from "miniflare";
import type * as vite from "vite";

export class PluginContext {
	#miniflare?: Miniflare;
	#localState: {
		resolvedPluginConfig?: ResolvedPluginConfig;
		resolvedViteConfig?: vite.ResolvedConfig;
		// containerTagToOptionsMap?: ContainerTagToOptionsMap;
	} = {};
	hasShownWorkerConfigWarnings = false;
	/** Used to track whether hooks are being called because of a server restart or a server close event */
	isRestartingDevServer = false;

	async setMiniflareOptions(options: MiniflareOptions): Promise<void> {
		if (!this.#miniflare) {
			debuglog("Creating new Miniflare instance");
			this.#miniflare = new Miniflare(options);
		} else {
			debuglog("Updating the existing Miniflare instance");
			await this.#miniflare.setOptions(options);
		}
		debuglog("Miniflare is ready");
	}

	async disposeMiniflare(): Promise<void> {
		await this.#miniflare?.dispose();
		this.#miniflare = undefined;
	}

	get miniflare(): Miniflare {
		assert(this.#miniflare, "Expected `miniflare` to be defined");

		return this.#miniflare;
	}

	resetLocalState(): void {
		this.#localState = {};
	}

	setResolvedPluginConfig(resolvedPluginConfig: ResolvedPluginConfig): void {
		this.#localState.resolvedPluginConfig = resolvedPluginConfig;
	}

	get resolvedPluginConfig(): ResolvedPluginConfig {
		assert(
			this.#localState.resolvedPluginConfig,
			"Expected `resolvedPluginConfig` to be defined"
		);

		return this.#localState.resolvedPluginConfig;
	}

	setResolvedViteConfig(resolvedViteConfig: vite.ResolvedConfig): void {
		this.#localState.resolvedViteConfig = resolvedViteConfig;
	}

	get resolvedViteConfig(): vite.ResolvedConfig {
		assert(
			this.#localState.resolvedViteConfig,
			"Expected `resolvedViteConfig` to be defined"
		);

		return this.#localState.resolvedViteConfig;
	}

	// setContainerTagToOptionsMap(
	// 	containerToOptionsMap: ContainerTagToOptionsMap
	// ): void {
	// 	this.#localState.containerTagToOptionsMap = containerToOptionsMap;
	// }

	// get containerTagToOptionsMap(): ContainerTagToOptionsMap {
	// 	assert(
	// 		this.#localState.containerTagToOptionsMap,
	// 		"Expected `containerTagToOptionsMap` to be defined"
	// 	);

	// 	return this.#localState.containerTagToOptionsMap;
	// }

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
