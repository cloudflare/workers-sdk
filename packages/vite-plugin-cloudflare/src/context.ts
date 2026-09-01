import assert from "node:assert";
import { Miniflare } from "miniflare";
import { getInitialWorkerNameToExportTypesMap } from "./export-types";
import { debuglog } from "./utils";
import type { ExportTypes } from "./export-types";
import type { NodeJsCompat } from "./nodejs-compat";
import type {
	AssetsOnlyResolvedConfig,
	PreviewResolvedConfig,
	ResolvedPluginConfig,
	ResolvedWorkerConfig,
	Worker,
	WorkersResolvedConfig,
} from "./plugin-config";
import type {
	ModuleType,
	ParsedInputSettingsConfig,
	ParsedInputWorkerConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";
import type { MiniflareOptions } from "miniflare";
import type * as vite from "vite";

/**
 * Used to store state that should persist across server restarts.
 * This is then accessed via `PluginContext`.
 */
export interface SharedContext {
	miniflare?: Miniflare;
	workerNameToExportTypesMap?: Map<string, ExportTypes>;
	/** Tracks the number of in-flight dev server restarts (0 means no restart in progress) */
	restartingDevServerCount: number;
	/** Allowed hostnames for tunnel connections */
	tunnelHostnames: Set<string>;
}

/** An explicitly typed additional module emitted by a Vite environment. */
export interface AdditionalModuleMetadata {
	environmentName: string;
	fileName: string;
	type: ModuleType;
}

/**
 * Used to provide context to internal plugins.
 * It should be reinstantiated each time the main plugin is created.
 */
export class PluginContext {
	#sharedContext: SharedContext;
	#resolvedPluginConfig?: ResolvedPluginConfig;
	#resolvedViteConfig?: vite.ResolvedConfig;
	#environmentNameToAdditionalModules = new Map<
		string,
		Map<string, ModuleType>
	>();

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

	setWorkerNameToExportTypesMap(
		workerNameToExportTypesMap: Map<string, ExportTypes>
	): void {
		this.#sharedContext.workerNameToExportTypesMap = workerNameToExportTypesMap;
	}

	get workerNameToExportTypesMap(): Map<string, ExportTypes> {
		if (!this.#sharedContext.workerNameToExportTypesMap) {
			if (this.resolvedPluginConfig.type !== "workers") {
				return new Map();
			}

			return getInitialWorkerNameToExportTypesMap(this.resolvedPluginConfig);
		}

		return this.#sharedContext.workerNameToExportTypesMap;
	}

	beginRestartingDevServer(): void {
		this.#sharedContext.restartingDevServerCount++;
	}

	endRestartingDevServer(): void {
		this.#sharedContext.restartingDevServerCount--;
	}

	get isRestartingDevServer(): boolean {
		return this.#sharedContext.restartingDevServerCount > 0;
	}

	getTunnelHostnames(): string[] {
		return Array.from(this.#sharedContext.tunnelHostnames);
	}

	replaceTunnelHostnames(tunnelHostnames: string[]): void {
		this.#sharedContext.tunnelHostnames.clear();
		for (const tunnelHostname of tunnelHostnames) {
			this.#sharedContext.tunnelHostnames.add(tunnelHostname);
		}
	}

	clearTunnelHostnames(): void {
		this.#sharedContext.tunnelHostnames.clear();
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

	isChildEnvironment(environmentName: string): boolean {
		if (this.resolvedPluginConfig.type === "preview") {
			return false;
		}

		for (const childEnvironmentNames of this.resolvedPluginConfig.environmentNameToChildEnvironmentNamesMap.values()) {
			if (childEnvironmentNames.includes(environmentName)) {
				return true;
			}
		}

		return false;
	}

	#getWorker(environmentName: string): Worker | undefined {
		if (this.resolvedPluginConfig.type === "preview") {
			return;
		}

		const worker =
			this.resolvedPluginConfig.environmentNameToWorkerMap.get(environmentName);

		if (worker) {
			return worker;
		}

		// Check if this is a child environment and, if so, return the parent's Worker
		for (const [parentEnvironmentName, childEnvironmentNames] of this
			.resolvedPluginConfig.environmentNameToChildEnvironmentNamesMap) {
			if (childEnvironmentNames.includes(environmentName)) {
				return this.resolvedPluginConfig.environmentNameToWorkerMap.get(
					parentEnvironmentName
				);
			}
		}

		return undefined;
	}

	getWorkerConfig(environmentName: string): ResolvedWorkerConfig | undefined {
		return this.#getWorker(environmentName)?.config;
	}

	getWorkerNewConfig(
		environmentName: string
	): ParsedInputWorkerConfig | undefined {
		return this.#getWorker(environmentName)?.config;
	}

	/** Clear the additional modules collected for an environment before rebuilding it. */
	clearAdditionalModules(environmentName: string): void {
		this.#environmentNameToAdditionalModules.delete(environmentName);
	}

	/** Record an explicitly typed additional module emitted by an environment. */
	addAdditionalModule(
		environmentName: string,
		fileName: string,
		type: ModuleType
	): void {
		const additionalModules =
			this.#environmentNameToAdditionalModules.get(environmentName) ??
			new Map();
		const existingType = additionalModules.get(fileName);
		assert(
			existingType === undefined || existingType === type,
			`Additional module "${fileName}" was emitted with conflicting types "${existingType}" and "${type}".`
		);
		additionalModules.set(fileName, type);
		this.#environmentNameToAdditionalModules.set(
			environmentName,
			additionalModules
		);
	}

	/** Get the additional modules emitted by a Worker environment and its children. */
	getAdditionalModules(
		workerEnvironmentName: string
	): AdditionalModuleMetadata[] {
		const environmentNames = [
			workerEnvironmentName,
			...(this.resolvedPluginConfig.type === "preview"
				? []
				: (this.resolvedPluginConfig.environmentNameToChildEnvironmentNamesMap.get(
						workerEnvironmentName
					) ?? [])),
		];

		return environmentNames.flatMap((environmentName) =>
			Array.from(
				this.#environmentNameToAdditionalModules.get(environmentName) ?? [],
				([fileName, type]) => ({ environmentName, fileName, type })
			)
		);
	}

	get allWorkerConfigs(): Array<
		ParsedInputWorkerConfig | ParsedOutputWorkerConfig
	> {
		if (this.resolvedPluginConfig.type === "preview") {
			return this.resolvedPluginConfig.workers.map((worker) => worker.config);
		}

		return Array.from(
			this.resolvedPluginConfig.environmentNameToWorkerMap.values()
		).map((worker) => worker.config);
	}

	get entryWorkerConfig(): ResolvedWorkerConfig | undefined {
		if (this.resolvedPluginConfig.type !== "workers") {
			return;
		}

		return this.resolvedPluginConfig.environmentNameToWorkerMap.get(
			this.resolvedPluginConfig.entryWorkerEnvironmentName
		)?.config;
	}

	get settings(): ParsedInputSettingsConfig | undefined {
		if (this.resolvedPluginConfig.type === "preview") {
			return this.resolvedPluginConfig.workers[0]?.settings;
		}

		return this.resolvedPluginConfig.parsedConfig.settings;
	}

	getNodeJsCompat(environmentName: string): NodeJsCompat | undefined {
		return this.#getWorker(environmentName)?.nodeJsCompat;
	}
}

interface NarrowedPluginContext<
	T extends ResolvedPluginConfig,
> extends PluginContext {
	readonly resolvedPluginConfig: T;
}

export type AssetsOnlyPluginContext =
	NarrowedPluginContext<AssetsOnlyResolvedConfig>;
export type WorkersPluginContext = NarrowedPluginContext<WorkersResolvedConfig>;
export type PreviewPluginContext = NarrowedPluginContext<PreviewResolvedConfig>;

export function assertIsNotPreview(
	ctx: PluginContext
): asserts ctx is AssetsOnlyPluginContext | WorkersPluginContext {
	assert(
		ctx.resolvedPluginConfig.type !== "preview",
		`Expected "assets-only" or "workers" plugin config`
	);
}

export function assertIsPreview(
	ctx: PluginContext
): asserts ctx is PreviewPluginContext {
	assert(
		ctx.resolvedPluginConfig.type === "preview",
		`Expected "preview" plugin config`
	);
}
