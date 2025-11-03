import assert from "node:assert";
import { Miniflare } from "miniflare";
import { debuglog } from "../utils";
import type { ResolvedPluginConfig, WorkerConfig } from "../plugin-config";
import type { NodeJsCompat } from "./nodejs-compat";
import type { MiniflareOptions } from "miniflare";
import type * as vite from "vite";

export interface SharedContext {
	miniflare?: Miniflare;
	hasShownWorkerConfigWarnings: boolean;
	/** Used to track whether hooks are being called because of a server restart or a server close event */
	isRestartingDevServer: boolean;
}

export class PluginContext {
	#sharedContext: SharedContext;
	#resolvedPluginConfig?: ResolvedPluginConfig;
	#resolvedViteConfig?: vite.ResolvedConfig;

	constructor(sharedContext: SharedContext) {
		this.#sharedContext = sharedContext;
	}

	/** Creates a new Miniflare instance or updates the existing instance */
	async startOrUpdateMiniflare(options: MiniflareOptions): Promise<void> {
		if (!this.#sharedContext.miniflare) {
			debuglog("Creating new Miniflare instance");
			this.#sharedContext.miniflare = new Miniflare(options);
		} else {
			debuglog("Updating the existing Miniflare instance");
			await this.#sharedContext.miniflare.setOptions(options);
		}
		debuglog("Miniflare is ready");
	}

	async disposeMiniflare(): Promise<void> {
		await this.#sharedContext.miniflare?.dispose();
		this.#sharedContext.miniflare = undefined;
	}

	get miniflare(): Miniflare {
		assert(this.#sharedContext.miniflare, "Expected `miniflare` to be defined");

		return this.#sharedContext.miniflare;
	}

	/**
	 * Gets the resolved inspector port provided by Miniflare
	 */
	async getResolvedInspectorPort(): Promise<number | null> {
		if (
			this.resolvedPluginConfig.inspectorPort === false ||
			!this.#sharedContext.miniflare
		) {
			return null;
		}

		const miniflareInspectorUrl =
			await this.#sharedContext.miniflare.getInspectorURL();

		return Number.parseInt(miniflareInspectorUrl.port);
	}

	setHasShownWorkerConfigWarnings(hasShownWorkerConfigWarnings: boolean): void {
		this.#sharedContext.hasShownWorkerConfigWarnings =
			hasShownWorkerConfigWarnings;
	}

	get hasShownWorkerConfigWarnings(): boolean {
		return this.#sharedContext.hasShownWorkerConfigWarnings;
	}

	setIsRestartingDevServer(isRestartingDevServer: boolean): void {
		this.#sharedContext.isRestartingDevServer = isRestartingDevServer;
	}

	get isRestartingDevServer(): boolean {
		return this.#sharedContext.isRestartingDevServer;
	}

	setResolvedPluginConfig(resolvedPluginConfig: ResolvedPluginConfig): void {
		this.#resolvedPluginConfig = resolvedPluginConfig;
	}

	get resolvedPluginConfig(): ResolvedPluginConfig {
		assert(
			this.#resolvedPluginConfig,
			"Expected `resolvedPluginConfig` to be defined"
		);

		return this.#resolvedPluginConfig;
	}

	setResolvedViteConfig(resolvedViteConfig: vite.ResolvedConfig): void {
		this.#resolvedViteConfig = resolvedViteConfig;
	}

	get resolvedViteConfig(): vite.ResolvedConfig {
		assert(
			this.#resolvedViteConfig,
			"Expected `resolvedViteConfig` to be defined"
		);

		return this.#resolvedViteConfig;
	}

	getWorkerConfig(environmentName: string): WorkerConfig | undefined {
		return this.resolvedPluginConfig.type === "workers"
			? this.resolvedPluginConfig.workers[environmentName]
			: undefined;
	}

	getNodeJsCompat(environmentName: string): NodeJsCompat | undefined {
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
