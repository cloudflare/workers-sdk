import assert from "node:assert";
import * as path from "node:path";
import {
	DEFAULT_WORKER_DIRECTORY_NAME,
	getWorkerBundleDir,
	writeSettingsConfig as writeBuildOutputSettingsConfig,
	writeWorkerConfig as writeBuildOutputWorkerConfig,
} from "@cloudflare/build-output-utils";
import * as vite from "vite";
import { loadViteManifest } from "../build";
import { MAIN_ENTRY_NAME } from "../cloudflare-environment";
import { assertIsNotPreview } from "../context";
import { resolveDevOnly } from "../plugin-config";
import { createPlugin } from "../utils";
import type { AdditionalModuleMetadata } from "../context";
import type { ModuleType } from "@cloudflare/config";

/** Emits Workers using the Build Output Specification after every environment has built. */
export const buildOutputPlugin = createPlugin("build-output", (ctx) => {
	return {
		buildApp: {
			order: "post",
			async handler(builder) {
				assertIsNotPreview(ctx);
				await buildUnbuiltWorkerEnvironments(builder);

				if (ctx.resolvedPluginConfig.type === "assets-only") {
					await writeBuildOutputWorkerConfig({
						root: builder.config.root,
						config: ctx.resolvedPluginConfig.config,
					});
				}

				for (const [environmentName, worker] of ctx.resolvedPluginConfig
					.environmentNameToWorkerMap) {
					if (
						resolveDevOnly(worker.devOnly) &&
						worker.directoryName !== DEFAULT_WORKER_DIRECTORY_NAME
					) {
						continue;
					}

					await writeWorkerConfig(
						builder,
						environmentName,
						worker.directoryName
					);
				}

				await writeSettingsConfig();
			},
		},
	};

	async function buildUnbuiltWorkerEnvironments(
		builder: vite.ViteBuilder
	): Promise<void> {
		if (ctx.resolvedPluginConfig.type === "preview") {
			return;
		}

		const workerEnvironments = [
			...ctx.resolvedPluginConfig.environmentNameToWorkerMap.entries(),
		]
			.filter(([_, worker]) => !resolveDevOnly(worker.devOnly))
			.map(([environmentName]) => {
				const environment = builder.environments[environmentName];
				assert(environment, `"${environmentName}" environment not found`);

				return environment;
			});

		await Promise.all(
			workerEnvironments
				.filter((environment) => !environment.isBuilt)
				.map((environment) => builder.build(environment))
		);
	}

	async function writeWorkerConfig(
		builder: vite.ViteBuilder,
		environmentName: string,
		workerDirectoryName: string
	): Promise<void> {
		const workerConfig = ctx.getWorkerNewConfig(environmentName);
		assert(
			workerConfig,
			`No config found for "${environmentName}" environment`
		);

		const environment = builder.environments[environmentName];
		assert(environment, `"${environmentName}" environment not found`);

		if (!environment.isBuilt) {
			assert(
				workerDirectoryName === DEFAULT_WORKER_DIRECTORY_NAME,
				`Expected "${environmentName}" environment to be built`
			);
			const clientEnvironment = builder.environments.client;
			assert(clientEnvironment, 'No "client" environment');
			if (!clientEnvironment.isBuilt) {
				throw new Error(
					"If `assetsOnly` is set to `true`, the client environment must be built"
				);
			}
			await writeBuildOutputWorkerConfig({
				root: builder.config.root,
				config: workerConfig,
				workerDirectoryName,
			});
			return;
		}

		const bundleDir = getWorkerBundleDir(
			builder.config.root,
			workerDirectoryName
		);
		const entryChunk = Object.values(loadViteManifest(bundleDir)).find(
			(chunk) => chunk.isEntry && chunk.name === MAIN_ENTRY_NAME
		);
		assert(entryChunk, `Expected entry chunk with name "${MAIN_ENTRY_NAME}"`);

		await writeBuildOutputWorkerConfig({
			root: builder.config.root,
			config: workerConfig,
			manifest: {
				type: "partial",
				mainModule: entryChunk.file,
				modules: collectAdditionalModules(builder, environmentName, bundleDir),
			},
			workerDirectoryName,
		});
	}

	function collectAdditionalModules(
		builder: vite.ViteBuilder,
		workerEnvironmentName: string,
		bundleDir: string
	): Record<string, { type: ModuleType }> {
		const modules: Record<string, { type: ModuleType }> = {};

		for (const metadata of ctx.getAdditionalModules(workerEnvironmentName)) {
			const modulePath = resolveModulePath(builder, bundleDir, metadata);
			const existingModule = modules[modulePath];
			assert(
				existingModule === undefined || existingModule.type === metadata.type,
				`Additional module "${modulePath}" was emitted with conflicting types "${existingModule?.type}" and "${metadata.type}".`
			);
			modules[modulePath] = { type: metadata.type };
		}

		return modules;
	}

	function resolveModulePath(
		builder: vite.ViteBuilder,
		bundleDir: string,
		metadata: AdditionalModuleMetadata
	): string {
		const environment = builder.environments[metadata.environmentName];
		assert(
			environment,
			`"${metadata.environmentName}" environment not found for additional module "${metadata.fileName}"`
		);
		const environmentOutDir = path.resolve(
			builder.config.root,
			environment.config.build.outDir
		);
		const modulePath = path.resolve(environmentOutDir, metadata.fileName);
		const relativePath = path.relative(bundleDir, modulePath);
		assert(
			relativePath !== ".." &&
				!relativePath.startsWith(`..${path.sep}`) &&
				!path.isAbsolute(relativePath),
			`Additional module "${metadata.fileName}" from environment "${metadata.environmentName}" was emitted outside the Worker bundle directory.`
		);

		return vite.normalizePath(relativePath);
	}

	/**
	 * Write the top-level `config.json`, recording the settings shared by every
	 * Worker, including the Vite mode the build ran in.
	 *
	 * Written even when there is no `settings` export, so the mode is always
	 * captured.
	 */
	async function writeSettingsConfig(): Promise<void> {
		if (ctx.resolvedPluginConfig.type === "preview") {
			return;
		}
		const settings = ctx.resolvedPluginConfig.parsedConfig.settings;

		await writeBuildOutputSettingsConfig(
			ctx.resolvedViteConfig.root,
			settings,
			ctx.resolvedViteConfig.mode
		);
	}
});
