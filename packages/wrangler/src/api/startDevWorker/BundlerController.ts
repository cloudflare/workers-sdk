import assert from "node:assert";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { watch } from "chokidar";
import { bundleWorker, shouldCheckFetch } from "../../deployment-bundle/bundle";
import { getBundleType } from "../../deployment-bundle/bundle-type";
import {
	createModuleCollector,
	getWrangler1xLegacyModuleReferences,
} from "../../deployment-bundle/module-collection";
import { noBundleWorker } from "../../deployment-bundle/no-bundle-worker";
import { runCustomBuild } from "../../deployment-bundle/run-custom-build";
import { getAssetChangeMessage } from "../../dev";
import { runBuild } from "../../dev/use-esbuild";
import { logger } from "../../logger";
import { isNavigatorDefined } from "../../navigator-user-agent";
import { getWranglerTmpDir } from "../../paths";
import { debounce } from "../../utils/debounce";
import { Controller } from "./BaseController";
import { castErrorCause } from "./events";
import { extractBindingsOfType } from "./utils";
import type { BundleResult } from "../../deployment-bundle/bundle";
import type { Entry } from "../../deployment-bundle/entry";
import type { EsbuildBundle } from "../../dev/use-esbuild";
import type { EphemeralDirectory } from "../../paths";
import type { ConfigUpdateEvent } from "./events";
import type { StartDevWorkerOptions } from "./types";

export class BundlerController extends Controller {
	#currentBundle?: EsbuildBundle;

	#customBuildWatcher?: ReturnType<typeof watch>;

	// Handle aborting in-flight custom builds as new ones come in from the filesystem watcher
	#customBuildAborter = new AbortController();

	async #runCustomBuild(config: StartDevWorkerOptions, filePath: string) {
		// If a new custom build comes in, we need to cancel in-flight builds
		this.#customBuildAborter.abort();
		this.#customBuildAborter = new AbortController();

		// Since `this.#customBuildAborter` will change as new builds are scheduled, store the specific AbortController that will be used for this build
		const buildAborter = this.#customBuildAborter;
		const relativeFile =
			path.relative(config.projectRoot, config.entrypoint) || ".";
		logger.log(`The file ${filePath} changed, restarting build...`);
		this.emitBundleStartEvent(config);
		try {
			await runCustomBuild(
				config.entrypoint,
				relativeFile,
				{
					cwd: config.build?.custom?.workingDirectory,
					command: config.build?.custom?.command,
				},
				config.config,
				"dev"
			);
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
				projectRoot: config.projectRoot,
				configPath: config.config,
				format: config.build.format,
				moduleRoot: config.build.moduleRoot,
				exports: config.build.exports,
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

			const doBindings = extractBindingsOfType(
				"durable_object_namespace",
				config.bindings
			);
			const workflowBindings = extractBindingsOfType(
				"workflow",
				config.bindings
			);
			const bundleResult: Omit<BundleResult, "stop"> = !config.build?.bundle
				? await noBundleWorker(
						entry,
						config.build.moduleRules,
						this.#tmpDir.path,
						config.pythonModules?.exclude ?? []
					)
				: await bundleWorker(entry, this.#tmpDir.path, {
						bundle: true,
						additionalModules: [],
						moduleCollector,
						doBindings,
						workflowBindings,
						jsxFactory: config.build.jsxFactory,
						jsxFragment: config.build.jsxFactory,
						tsconfig: config.build.tsconfig,
						minify: config.build.minify,
						keepNames: config.build.keepNames ?? true,
						nodejsCompatMode: config.build.nodejsCompatMode,
						compatibilityDate: config.compatibilityDate,
						compatibilityFlags: config.compatibilityFlags,
						define: config.build.define,
						checkFetch: shouldCheckFetch(
							config.compatibilityDate,
							config.compatibilityFlags
						),
						alias: config.build.alias,
						// We want to know if the build is for development or publishing
						// This could potentially cause issues as we no longer have identical behaviour between dev and deploy?
						targetConsumer: "dev",
						local: !config.dev?.remote,
						projectRoot: config.projectRoot,
						defineNavigatorUserAgent: isNavigatorDefined(
							config.compatibilityDate,
							config.compatibilityFlags
						),
						testScheduled: config.dev.testScheduled,
						plugins: undefined,

						// Pages specific options used by wrangler pages commands
						entryName: undefined,
						inject: undefined,
						isOutfile: undefined,
						external: undefined,

						// We don't use esbuild watching for custom builds
						watch: undefined,

						// sourcemap defaults to true in dev
						sourcemap: undefined,

						metafile: undefined,
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
			// The initial custom build is always done in getEntry()
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
	#bundleBuildAborter = new AbortController();

	async #startBundle(config: StartDevWorkerOptions) {
		await this.#bundlerCleanup?.();
		// If a new bundle build comes in, we need to cancel in-flight builds
		this.#bundleBuildAborter.abort();
		this.#bundleBuildAborter = new AbortController();

		// Since `this.#customBuildAborter` will change as new builds are scheduled, store the specific AbortController that will be used for this build
		const buildAborter = this.#bundleBuildAborter;

		if (config.build?.custom?.command) {
			return;
		}
		assert(this.#tmpDir);
		const entry: Entry = {
			file: config.entrypoint,
			projectRoot: config.projectRoot,
			configPath: config.config,
			format: config.build.format,
			moduleRoot: config.build.moduleRoot,
			exports: config.build.exports,
			name: config.name,
		};

		const durableObjects = {
			bindings: extractBindingsOfType(
				"durable_object_namespace",
				config.bindings
			),
		};
		const workflows = extractBindingsOfType("workflow", config.bindings);

		this.#bundlerCleanup = runBuild(
			{
				entry,
				destination: this.#tmpDir.path,
				jsxFactory: config.build?.jsxFactory,
				jsxFragment: config.build?.jsxFragment,
				processEntrypoint: Boolean(config.build?.processEntrypoint),
				additionalModules: config.build?.additionalModules ?? [],
				rules: config.build.moduleRules,
				tsconfig: config.build?.tsconfig,
				minify: config.build?.minify,
				keepNames: config.build?.keepNames ?? true,
				nodejsCompatMode: config.build.nodejsCompatMode,
				compatibilityDate: config.compatibilityDate,
				compatibilityFlags: config.compatibilityFlags,
				define: config.build.define,
				alias: config.build.alias,
				noBundle: !config.build?.bundle,
				findAdditionalModules: config.build?.findAdditionalModules,
				durableObjects,
				workflows,
				local: !config.dev?.remote,
				// startDevWorker only applies to "dev"
				targetConsumer: "dev",
				testScheduled: Boolean(config.dev?.testScheduled),
				projectRoot: config.projectRoot,
				onStart: () => {
					this.emitBundleStartEvent(config);
				},
				checkFetch: shouldCheckFetch(
					config.compatibilityDate,
					config.compatibilityFlags
				),
				defineNavigatorUserAgent: isNavigatorDefined(
					config.compatibilityDate,
					config.compatibilityFlags
				),
				pythonModulesExcludes: config.pythonModules?.exclude ?? [],
			},
			(cb) => {
				const newBundle = cb(this.#currentBundle);
				if (!buildAborter.signal.aborted) {
					this.emitBundleCompleteEvent(config, newBundle);
					this.#currentBundle = newBundle;
				}
			},
			(err) => {
				if (!buildAborter.signal.aborted) {
					this.emitErrorEvent({
						type: "error",
						reason: "Failed to construct initial bundle",
						cause: castErrorCause(err),
						source: "BundlerController",
						data: undefined,
					});
				}
			}
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
			this.#tmpDir = getWranglerTmpDir(event.config.projectRoot, "dev");
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

		void this.#startCustomBuild(event.config).catch((err) => {
			logger.error("Failed to run custom build:", err);
			this.emitErrorEvent({
				type: "error",
				reason: "Failed to run custom build",
				cause: castErrorCause(err),
				source: "BundlerController",
				data: { config: event.config },
			});
		});
		void this.#startBundle(event.config).catch((err) => {
			logger.error("Failed to start bundler:", err);
			this.emitErrorEvent({
				type: "error",
				reason: "Failed to start bundler",
				cause: castErrorCause(err),
				source: "BundlerController",
				data: { config: event.config },
			});
		});
		void this.#ensureWatchingAssets(event.config).catch((err) => {
			logger.error("Failed to watch assets:", err);
			this.emitErrorEvent({
				type: "error",
				reason: "Failed to watch assets",
				cause: castErrorCause(err),
				source: "BundlerController",
				data: { config: event.config },
			});
		});
	}

	override async teardown() {
		logger.debug("BundlerController teardown beginning...");
		await super.teardown();
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
		this.bus.dispatch({ type: "bundleStart", config });
	}
	emitBundleCompleteEvent(
		config: StartDevWorkerOptions,
		bundle: EsbuildBundle
	) {
		this.bus.dispatch({ type: "bundleComplete", config, bundle });
	}
}
