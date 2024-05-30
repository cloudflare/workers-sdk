import assert from "assert";
import path from "path";
import { watch } from "chokidar";
import { runCustomBuild } from "../../deployment-bundle/run-custom-build";
import { runBuild } from "../../dev/use-esbuild";
import { logger } from "../../logger";
import { isNavigatorDefined } from "../../navigator-user-agent";
import { getWranglerTmpDir } from "../../paths";
import { Controller } from "./BaseController";
import { castErrorCause } from "./events";
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
	// ******************
	//   Event Handlers
	// ******************

	#runEsbuild(
		config: StartDevWorkerOptions,
		onStart: () => void,
		setBundle: (
			cb: (previous: EsbuildBundle | undefined) => EsbuildBundle
		) => void,
		enableWatchMode = true
	) {
		assert(this.#tmpDir);
		assert(config._entry, "config._entry");
		assert(config._additionalModules, "config._additionalModules");
		assert(config.build?.moduleRules, "config.build?.moduleRules");
		assert(config.build?.define, "config.build?.define");
		return runBuild(
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
				legacyNodeCompat: config._legacyNodeCompat,
				nodejsCompat: config.compatibilityFlags?.includes("nodejs_compat"),
				define: config.build.define,
				noBundle: !config.build?.bundle,
				findAdditionalModules: config.build?.findAdditionalModules,
				durableObjects: config._bindings?.durable_objects ?? { bindings: [] },
				local: !config.dev?.remote,
				// startDevWorker only applies to "dev"
				targetConsumer: "dev",
				testScheduled: Boolean(config.dev?.testScheduled),
				projectRoot: config._projectRoot,
				onStart,
				defineNavigatorUserAgent: isNavigatorDefined(
					config.compatibilityDate,
					config.compatibilityFlags
				),
				enableWatchMode,
			},
			setBundle,
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

	#customBuildWatcher?: ReturnType<typeof watch>;

	#runCustomBuild(config: StartDevWorkerOptions, filePath: string) {
		console.log("watcher event all");
		assert(config._entry);
		const relativeFile =
			path.relative(config._entry.directory, config._entry.file) || ".";
		logger.log(`The file ${filePath} changed, restarting build...`);
		this.emitBundleStartEvent({
			type: "bundleStart",
			config,
		});
		runCustomBuild(config._entry.file, relativeFile, {
			cwd: config.build?.custom.workingDirectory,
			command: config.build?.custom.command,
		})
			.catch((err) => {
				logger.error("Custom build failed:", err);
			})
			.finally(() => {
				const cleanup = this.#runEsbuild(
					config,
					() => {
						// We don't need to emit an event here because we've alreayd emitted one for the custom build start
					},
					(cb) => {
						const newBundle = cb(undefined);
						this.emitBundleCompletetEvent({
							type: "bundleComplete",
							config,
							bundle: newBundle,
						});
						// We only want to build once
						cleanup?.();
					},
					false
				);
			});
	}

	#startCustomBuild(config: StartDevWorkerOptions) {
		assert(config._entry);
		assert(config.build?.custom.watch);
		this.#customBuildWatcher = watch(config.build?.custom.watch, {
			persistent: true,
			ignoreInitial: true,
		});
		this.#customBuildWatcher.on("ready", () =>
			this.#runCustomBuild(config, String(config.build?.custom.watch))
		);

		this.#customBuildWatcher.on("all", (_event, filePath) =>
			this.#runCustomBuild(config, filePath)
		);
	}

	#bundlerCleanup?: ReturnType<typeof runBuild>;

	#currentBundle?: EsbuildBundle;

	#startBundle(config: StartDevWorkerOptions) {
		this.#bundlerCleanup = this.#runEsbuild(
			config,
			() => {
				this.emitBundleStartEvent({
					type: "bundleStart",
					config,
				});
			},
			(cb) => {
				const newBundle = cb(this.#currentBundle);
				this.emitBundleCompletetEvent({
					type: "bundleComplete",
					config,
					bundle: newBundle,
				});
				this.#currentBundle = newBundle;
			}
		);
	}

	#tmpDir?: EphemeralDirectory;

	async onConfigUpdate(event: ConfigUpdateEvent) {
		try {
			this.#tmpDir ??= getWranglerTmpDir(event.config._projectRoot, "dev");
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

		// Cleanup both custom builds and esbuild watch builds in case we're switching from one to the other
		await this.#customBuildWatcher?.close();
		await this.#bundlerCleanup?.();

		if (event.config.build?.custom.command) {
			this.#startCustomBuild(event.config);
		} else {
			this.#startBundle(event.config);
		}
	}

	async teardown() {
		await this.#customBuildWatcher?.close();
		await this.#bundlerCleanup?.();
		this.#tmpDir?.remove();
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitBundleStartEvent(data: BundleStartEvent) {
		this.emit("bundleStart", data);
	}
	emitBundleCompletetEvent(data: BundleCompleteEvent) {
		this.emit("bundleComplete", data);
	}
}
