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
import { runBuild } from "../../dev/use-esbuild";
import { logger } from "../../logger";
import { isNavigatorDefined } from "../../navigator-user-agent";
import { getWranglerTmpDir } from "../../paths";
import { Controller } from "./BaseController";
import { castErrorCause } from "./events";
import type { BundleResult } from "../../deployment-bundle/bundle";
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
		assert(config._entry);
		const relativeFile =
			path.relative(config._entry.directory, config._entry.file) || ".";
		logger.log(`The file ${filePath} changed, restarting build...`);
		this.emitBundleStartEvent({
			type: "bundleStart",
			config,
		});
		try {
			await runCustomBuild(config._entry.file, relativeFile, {
				cwd: config.build?.custom.workingDirectory,
				command: config.build?.custom.command,
			});
			if (buildAborter.signal.aborted) {
				return;
			}
			assert(this.#tmpDir);
			assert(config._entry, "config._entry");
			assert(config._additionalModules, "config._additionalModules");
			assert(config.build?.moduleRules, "config.build?.moduleRules");
			assert(config.build?.define, "config.build?.define");
			if (!config.build?.bundle) {
				// if we're not building, let's just copy the entry to the destination directory
				const destinationDir = this.#tmpDir.path;
				writeFileSync(
					path.join(destinationDir, path.basename(config._entry.file)),
					readFileSync(config._entry.file, "utf-8")
				);
			}

			const entryDirectory = path.dirname(config._entry.file);
			const moduleCollector = createModuleCollector({
				wrangler1xLegacyModuleReferences: getWrangler1xLegacyModuleReferences(
					entryDirectory,
					config._entry.file
				),
				entry: config._entry,
				// `moduleCollector` doesn't get used when `props.noBundle` is set, so
				// `findAdditionalModules` always defaults to `false`
				findAdditionalModules: config.build.findAdditionalModules ?? false,
				rules: config.build.moduleRules,
			});

			const bundleResult: Omit<BundleResult, "stop"> = !config.build?.bundle
				? await noBundleWorker(
						config._entry,
						config.build.moduleRules,
						this.#tmpDir.path
					)
				: await bundleWorker(config._entry, this.#tmpDir.path, {
						bundle: true,
						additionalModules: [],
						moduleCollector,
						serveAssetsFromWorker: Boolean(config._serveAssetsFromWorker),
						doBindings: config._bindings?.durable_objects?.bindings ?? [],
						jsxFactory: config.build.jsxFactory,
						jsxFragment: config.build.jsxFactory,
						tsconfig: config.build.tsconfig,
						minify: config.build.minify,
						nodejsCompatMode: config.build.nodejsCompatMode,
						define: config.build.define,
						checkFetch: true,
						assets: config._assets,
						// enable the cache when publishing
						bypassAssetCache: false,
						// We want to know if the build is for development or publishing
						// This could potentially cause issues as we no longer have identical behaviour between dev and deploy?
						targetConsumer: "dev",
						local: !config.dev?.remote,
						projectRoot: config._projectRoot,
						defineNavigatorUserAgent: isNavigatorDefined(
							config.compatibilityDate,
							config.compatibilityFlags
						),
					});
			if (buildAborter.signal.aborted) {
				return;
			}
			const entrypointPath = realpathSync(
				bundleResult?.resolvedEntryPointPath ?? config._entry.file
			);
			this.emitBundleCompletedEvent({
				type: "bundleComplete",
				config,
				bundle: {
					id: 0,
					entry: config._entry,
					path: entrypointPath,
					type:
						bundleResult?.bundleType ??
						getBundleType(config._entry.format, config._entry.file),
					modules: bundleResult.modules,
					dependencies: bundleResult?.dependencies ?? {},
					sourceMapPath: bundleResult?.sourceMapPath,
					sourceMapMetadata: bundleResult?.sourceMapMetadata,
					entrypointSource: readFileSync(entrypointPath, "utf8"),
				},
			});
		} catch (err) {
			logger.error("Custom build failed:", err);
			this.emitErrorEvent({
				type: "error",
				reason: "Custom build failed",
				cause: castErrorCause(err),
				source: "BundlerController",
				data: undefined,
			});
		}
	}

	#startCustomBuild(config: StartDevWorkerOptions) {
		assert(config._entry);
		assert(config.build?.custom.watch);
		this.#customBuildWatcher = watch(config.build?.custom.watch, {
			persistent: true,
			ignoreInitial: true,
		});
		this.#customBuildWatcher.on(
			"ready",
			() =>
				void this.#runCustomBuild(config, String(config.build?.custom.watch))
		);

		this.#customBuildWatcher.on(
			"all",
			(_event, filePath) => void this.#runCustomBuild(config, filePath)
		);
	}

	#bundlerCleanup?: ReturnType<typeof runBuild>;

	#startBundle(config: StartDevWorkerOptions) {
		assert(this.#tmpDir);
		assert(config._entry, "config._entry");
		assert(config._additionalModules, "config._additionalModules");
		assert(config.build?.moduleRules, "config.build?.moduleRules");
		assert(config.build?.define, "config.build?.define");
		this.#bundlerCleanup = runBuild(
			{
				entry: config._entry,
				destination: this.#tmpDir.path,
				jsxFactory: config.build?.jsxFactory,
				jsxFragment: config.build?.jsxFragment,
				processEntrypoint: Boolean(config._processEntrypoint),
				additionalModules: config._additionalModules,
				rules: config.build.moduleRules,
				assets: config._assets,
				serveAssetsFromWorker: Boolean(config._serveAssetsFromWorker),
				tsconfig: config.build?.tsconfig,
				minify: config.build?.minify,
				nodejsCompatMode: config.build.nodejsCompatMode,
				define: config.build.define,
				noBundle: !config.build?.bundle,
				findAdditionalModules: config.build?.findAdditionalModules,
				durableObjects: config._bindings?.durable_objects ?? { bindings: [] },
				local: !config.dev?.remote,
				// startDevWorker only applies to "dev"
				targetConsumer: "dev",
				testScheduled: Boolean(config.dev?.testScheduled),
				projectRoot: config._projectRoot,
				onStart: () => {
					this.emitBundleStartEvent({
						type: "bundleStart",
						config,
					});
				},
				defineNavigatorUserAgent: isNavigatorDefined(
					config.compatibilityDate,
					config.compatibilityFlags
				),
			},
			(cb) => {
				const newBundle = cb(this.#currentBundle);
				this.emitBundleCompletedEvent({
					type: "bundleComplete",
					config,
					bundle: newBundle,
				});
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

	#tmpDir?: EphemeralDirectory;

	async onConfigUpdate(event: ConfigUpdateEvent) {
		await this.teardown();
		try {
			this.#tmpDir = getWranglerTmpDir(event.config._projectRoot, "dev");
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

		if (event.config.build?.custom.command) {
			this.#startCustomBuild(event.config);
		} else {
			this.#startBundle(event.config);
		}
	}

	async teardown() {
		await this.#customBuildWatcher?.close();
		await this.#bundlerCleanup?.();
		this.#customBuildAborter?.abort();
		this.#tmpDir?.remove();
	}

	emitBundleStartEvent(data: BundleStartEvent) {
		this.emit("bundleStart", data);
	}
	emitBundleCompletedEvent(data: BundleCompleteEvent) {
		this.emit("bundleComplete", data);
	}
}
