import assert from "node:assert";
import { getDevVarsCandidatePaths } from "@cloudflare/workers-utils/local-env";
import { hasAssetsConfigChanged } from "./asset-config";
import { assertIsNotPreview } from "./context";
import { debuglog } from "./utils";
import type { PluginContext } from "./context";
import type * as vite from "vite";

/** Coordinates Worker config changes across Vite dev server restarts. */
export class ConfigChangeCoordinator {
	#pluginContext?: PluginContext;
	#server?: vite.ViteDevServer;
	#localDevVarsFiles = new Set<string>();
	#restartInFlight = false;
	#restartPending = false;

	registerServer(ctx: PluginContext, server: vite.ViteDevServer): void {
		this.#pluginContext = ctx;

		// Replacement servers are configured before Vite swaps them in. Their
		// watchers must not receive config changes during that interval, otherwise
		// a rapid second save can start another independent restart.
		if (ctx.isRestartingDevServer) {
			return;
		}

		this.#server = server;
		this.#attachWatcher();
	}

	restartCompleted(): void {
		this.#attachWatcher();
	}

	#attachWatcher(): void {
		const ctx = this.#pluginContext;
		assert(ctx, "Expected the current plugin context to be defined");
		assert(this.#server, "Expected the active Vite dev server to be defined");
		const watcher = this.#server.watcher;
		this.#localDevVarsFiles = new Set(
			getDevVarsCandidatePaths(
				ctx.resolvedViteConfig.envDir,
				ctx.resolvedViteConfig.mode
			)
		);
		watcher.add([...this.#localDevVarsFiles]);

		watcher.off("change", this.#handleChange);
		watcher.off("add", this.#handleChange);
		watcher.off("unlink", this.#handleChange);
		watcher.on("change", this.#handleChange);
		watcher.on("add", this.#handleChange);
		watcher.on("unlink", this.#handleChange);
	}

	readonly #handleChange = async (changedFilePath: string): Promise<void> => {
		const ctx = this.#pluginContext;
		assert(ctx, "Expected the current plugin context to be defined");
		assertIsNotPreview(ctx);
		const resolvedPluginConfig = ctx.resolvedPluginConfig;

		if (
			!this.#localDevVarsFiles.has(changedFilePath) &&
			!resolvedPluginConfig.configPaths.has(changedFilePath) &&
			!hasAssetsConfigChanged(
				resolvedPluginConfig,
				ctx.resolvedViteConfig,
				changedFilePath
			)
		) {
			return;
		}

		debuglog("Config changed: " + changedFilePath);
		if (this.#restartInFlight) {
			this.#restartPending = true;
			return;
		}

		assert(this.#server, "Expected the active Vite dev server to be defined");
		const restartAlreadyInFlight = ctx.isRestartingDevServer;
		this.#restartInFlight = true;
		try {
			// Vite returns the existing promise when a restart is already running. Wait
			// for that restart first, then start another one to ensure this config change
			// is loaded even if the existing restart had already read the old config.
			if (restartAlreadyInFlight) {
				await this.#server.restart();
			}

			do {
				this.#restartPending = false;
				debuglog("Restarting dev server and aborting previous setup");
				await this.#server.restart();
			} while (this.#restartPending);
		} finally {
			this.#restartInFlight = false;
		}
	};
}
