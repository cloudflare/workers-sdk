import assert from "assert";
import { readFileSync, realpathSync, writeFileSync } from "fs";
import path from "path";
import { watch } from "chokidar";
import { noBundleWorker } from "../../deploy/deploy";
import { bundleWorker } from "../../deployment-bundle/bundle";
import { getBundleType } from "../../deployment-bundle/bundle-type";
import {
	createModuleCollector,
	getWrangler1xLegacyModuleReferences,
} from "../../deployment-bundle/module-collection";
import { runCustomBuild } from "../../deployment-bundle/run-custom-build";
import { getAssetChangeMessage } from "../../dev";
import { runBuild } from "../../dev/use-esbuild";
import { logger } from "../../logger";
import { isNavigatorDefined } from "../../navigator-user-agent";
import { debounce } from "../../pages/utils";
import { getWranglerTmpDir } from "../../paths";
import { Controller } from "./BaseController";
import { castErrorCause } from "./events";
import { convertBindingsToCfWorkerInitBindings } from "./utils";
import type { BundleResult } from "../../deployment-bundle/bundle";
import type { Entry } from "../../deployment-bundle/entry";
import type { EsbuildBundle } from "../../dev/use-esbuild";
import type { EphemeralDirectory } from "../../paths";
import type { ControllerEventMap } from "./BaseController";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	ConfigUpdateEvent,
} from "./events";
import type { StartDevWorkerOptions } from "./types";

export type BundlerControllerEventMap = ControllerEventMap & {
	bundleStart: [BundleStartEvent];
	bundleComplete: [BundleCompleteEvent];
};
export class BundlerController extends Controller<BundlerControllerEventMap> {
	#currentBundle?: EsbuildBundle;

	#customBuildWatcher?: ReturnType<typeof watch>;

	// Handle aborting in-flight custom builds as new ones come in from the filesystem watcher
	// Note: we don't need this for non-custom builds since esbuild handles this internally with it's watch mode
	#customBuildAborter = new AbortController();

	async #runCustomBuild(config: StartDevWorkerOptions, filePath: string) {
		// If a new custom build comes in, we need to cancel in-flight builds
		this.#customBuildAborter.abort();
		this.#customBuildAborter = new AbortController();

		// Since `this.#customBuildAborter` will change as new builds are scheduled, store the specific AbortController that will be used for this build
		const buildAborter = this.#customBuildAborter;
		const relativeFile =
			path.relative(config.directory, config.entrypoint) || ".";
		logger.log(`The file ${filePath} changed, restarting build...`);
		this.emitBundleStartEvent(config);
		try {
			await runCustomBuild(config.entrypoint, relativeFile, {
				cwd: config.build?.custom?.workingDirectory,
				command: config.build?.custom?.command,
			});
			if (buildAborter.signal.aborted) {
				return;
			}
			assert(this.#tmpDir);
			if (!config.build?.bundle) {
				// if we're not bundling, let's just copy the entry to the destination directory
				const destinationDir = this.#tmpDir.path;
				writeFileSync(
					path.join(destinationDir, path.basename(config.entrypoint)),
					readFileSync(config.entrypoint, "utf-8")
				);
			}

			const entry: Entry = {
				file: config.entrypoint,
				directory: config.directory,
				format: config.build.format,
				moduleRoot: config.build.moduleRoot,
			};

			const entryDirectory = path.dirname(config.entrypoint);
			const moduleCollector = createModuleCollector({
				wrangler1xLegacyModuleReferences: getWrangler1xLegacyModuleReferences(
					entryDirectory,
					config.entrypoint
				),
				entry,
				// `moduleCollector` doesn't get used when `noBundle` is set, so
				// `findAdditionalModules` always defaults to `false`
				findAdditionalModules: config.build.findAdditionalModules ?? false,
				rules: config.build.moduleRules,
			});

			const bindings = (
				await convertBindingsToCfWorkerInitBindings(config.bindings)
			).bindings;
			const bundleResult: Omit<BundleResult, "stop"> = !config.build?.bundle
				? await noBundleWorker(
						entry,
						config.build.moduleRules,
						this.#tmpDir.path
					)
				: await bundleWorker(entry, this.#tmpDir.path, {
						bundle: true,
						additionalModules: [],
						moduleCollector,
						serveLegacyAssetsFromWorker: Boolean(
							config.legacy?.legacyAssets && !config.dev?.remote
						),
						doBindings: bindings?.durable_objects?.bindings ?? [],
						jsxFactory: config.build.jsxFactory,
						jsxFragment: config.build.jsxFactory,
						tsconfig: config.build.tsconfig,
						minify: config.build.minify,
						nodejsCompatMode: config.build.nodejsCompatMode,
						define: config.build.define,
						checkFetch: true,
						mockAnalyticsEngineDatasets:
							bindings.analytics_engine_datasets ?? [],
						alias: config.build.alias,
						legacyAssets: config.legacy?.legacyAssets,
						// enable the cache when publishing
						bypassAssetCache: false,
						// We want to know if the build is for development or publishing
						// This could potentially cause issues as we no longer have identical behaviour between dev and deploy?
						targetConsumer: "dev",
						local: !config.dev?.remote,
						projectRoot: config.directory,
						defineNavigatorUserAgent: isNavigatorDefined(
							config.compatibilityDate,
							config.compatibilityFlags
						),
					});
			if (buildAborter.signal.aborted) {
				return;
			}
			const entrypointPath = realpathSync(
				bundleResult?.resolvedEntryPointPath ?? config.entrypoint
			);

			this.emitBundleCompleteEvent(config, {
				id: 0,
				entry,
				path: entrypointPath,
				type:
					bundleResult?.bundleType ??
					getBundleType(config.build.format, config.entrypoint),
				modules: bundleResult.modules,
				dependencies: bundleResult?.dependencies ?? {},
				sourceMapPath: bundleResult?.sourceMapPath,
				sourceMapMetadata: bundleResult?.sourceMapMetadata,
				entrypointSource: readFileSync(entrypointPath, "utf8"),
			});
		} catch (err) {
			logger.error("Custom build failed:", err);
			this.emitErrorEvent({
				type: "error",
				reason: "Custom build failed",
				cause: castErrorCause(err),
				source: "BundlerController",
				data: { config, filePath },
			});
		}
	}

	async #startCustomBuild(config: StartDevWorkerOptions) {
		await this.#customBuildWatcher?.close();
		this.#customBuildAborter?.abort();

		if (!config.build?.custom?.command) {
			return;
		}

		const pathsToWatch = config.build.custom.watch;

		// This is always present if a custom command is provided, defaulting to `./src`
		assert(pathsToWatch, "config.build.custom.watch");

		this.#customBuildWatcher = watch(pathsToWatch, {
			persistent: true,
			// TODO: add comments re this ans ready
			ignoreInitial: true,
		});
		this.#customBuildWatcher.on("ready", () => {
			void this.#runCustomBuild(config, String(pathsToWatch));
		});

		this.#customBuildWatcher.on(
			"all",
			(_event, filePath) => void this.#runCustomBuild(config, filePath)
		);
	}

	#bundlerCleanup?: ReturnType<typeof runBuild>;

	async #startBundle(config: StartDevWorkerOptions) {
		await this.#bundlerCleanup?.();
		if (config.build?.custom?.command) {
			return;
		}
		assert(this.#tmpDir);
		const entry: Entry = {
			file: config.entrypoint,
			directory: config.directory,
			format: config.build.format,
			moduleRoot: config.build.moduleRoot,
		};
		const { bindings } = await convertBindingsToCfWorkerInitBindings(
			config.bindings
		);
		this.#bundlerCleanup = runBuild(
			{
				entry,
				destination: this.#tmpDir.path,
				jsxFactory: config.build?.jsxFactory,
				jsxFragment: config.build?.jsxFragment,
				processEntrypoint: Boolean(config.build?.processEntrypoint),
				additionalModules: config.build?.additionalModules ?? [],
				rules: config.build.moduleRules,
				legacyAssets: config.legacy?.legacyAssets,
				serveLegacyAssetsFromWorker: Boolean(
					config.legacy?.legacyAssets && !config.dev?.remote
				),
				tsconfig: config.build?.tsconfig,
				minify: config.build?.minify,
				nodejsCompatMode: config.build.nodejsCompatMode,
				define: config.build.define,
				alias: config.build.alias,
				noBundle: !config.build?.bundle,
				findAdditionalModules: config.build?.findAdditionalModules,
				durableObjects: bindings?.durable_objects ?? { bindings: [] },
				mockAnalyticsEngineDatasets: bindings.analytics_engine_datasets ?? [],
				local: !config.dev?.remote,
				// startDevWorker only applies to "dev"
				targetConsumer: "dev",
				testScheduled: Boolean(config.dev?.testScheduled),
				projectRoot: config.directory,
				onStart: () => {
					this.emitBundleStartEvent(config);
				},
				defineNavigatorUserAgent: isNavigatorDefined(
					config.compatibilityDate,
					config.compatibilityFlags
				),
			},
			(cb) => {
				const newBundle = cb(this.#currentBundle);
				this.emitBundleCompleteEvent(config, newBundle);
				this.#currentBundle = newBundle;
			},
			(err) =>
				this.emitErrorEvent({
					type: "error",
					reason: "Failed to construct initial bundle",
					cause: castErrorCause(err),
					source: "BundlerController",
					data: undefined,
				})
		);
	}

	#assetsWatcher?: ReturnType<typeof watch>;
	async #ensureWatchingAssets(config: StartDevWorkerOptions) {
		await this.#assetsWatcher?.close();

		const debouncedRefreshBundle = debounce(() => {
			if (this.#currentBundle) {
				this.emitBundleCompleteEvent(config, this.#currentBundle);
			}
		});

		if (config.assets?.directory) {
			this.#assetsWatcher = watch(config.assets.directory, {
				persistent: true,
				ignoreInitial: true,
			}).on("all", async (eventName, filePath) => {
				const message = getAssetChangeMessage(eventName, filePath);
				logger.debug(`🌀 ${message}...`);
				debouncedRefreshBundle();
			});
		}
	}

	#tmpDir?: EphemeralDirectory;

	onConfigUpdate(event: ConfigUpdateEvent) {
		this.#tmpDir?.remove();
		try {
			this.#tmpDir = getWranglerTmpDir(event.config.directory, "dev");
		} catch (e) {
			logger.error(
				"Failed to create temporary directory to store built files."
			);
			this.emitErrorEvent({
				type: "error",
				reason: "Failed to create temporary directory to store built files.",
				cause: castErrorCause(e),
				source: "BundlerController",
				data: undefined,
			});
		}

		void this.#startCustomBuild(event.config);
		void this.#startBundle(event.config);
		void this.#ensureWatchingAssets(event.config);
	}

	async teardown() {
		logger.debug("BundlerController teardown beginning...");
		this.#customBuildAborter?.abort();
		this.#tmpDir?.remove();
		await Promise.all([
			this.#bundlerCleanup?.(),
			this.#customBuildWatcher?.close(),
			this.#assetsWatcher?.close(),
		]);
		logger.debug("BundlerController teardown complete");
	}

	emitBundleStartEvent(config: StartDevWorkerOptions) {
		this.emit("bundleStart", { type: "bundleStart", config });
	}
	emitBundleCompleteEvent(
		config: StartDevWorkerOptions,
		bundle: EsbuildBundle
	) {
		this.emit("bundleComplete", { type: "bundleComplete", config, bundle });
	}
}
