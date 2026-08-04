import assert from "node:assert";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractBindingsOfType } from "@cloudflare/deploy-helpers";
import { getWranglerTmpDir } from "@cloudflare/workers-utils";
import { watch } from "chokidar";
import { BuildFailure } from "../../deployment-bundle/build-failures";
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
import { debounce } from "../../utils/debounce";
import { isAbortError } from "../../utils/isAbortError";
import { Controller } from "./BaseController";
import { castErrorCause } from "./events";
import type { BundleResult } from "../../deployment-bundle/bundle";
import type { EsbuildBundle } from "../../dev/use-esbuild";
import type { ConfigUpdateEvent } from "./events";
import type { StartDevWorkerOptions } from "./types";
import type { EphemeralDirectory, Entry } from "@cloudflare/workers-utils";

type PendingCustomBuild = {
	config: StartDevWorkerOptions;
	filePath: string;
	buildAborter: AbortController;
};

export class BundlerController extends Controller {
	#currentBundle?: EsbuildBundle;

	#customBuildWatcher?: ReturnType<typeof watch>;
	#debouncedCustomBuild?: ReturnType<typeof debounce>;

	// Handle aborting in-flight custom builds as new ones come in from the filesystem watcher
	#customBuildAborter = new AbortController();

	/**
	 * The custom build that is waiting for the in-flight one to finish, if any.
	 *
	 * Only the most recent request is kept. A custom build always builds from
	 * whatever is on disk when it runs, so an earlier queued request would just
	 * repeat the same work.
	 */
	#pendingCustomBuild?: PendingCustomBuild;

	/**
	 * The promise for the loop that is currently working through
	 * `#pendingCustomBuild`, or `undefined` if no loop is running.
	 */
	#customBuildDrain?: Promise<void>;

	/**
	 * Queue a custom build, superseding any build that is in-flight or waiting.
	 *
	 * Custom builds are run one at a time. Running them concurrently lets two
	 * builds write to the same output files at once, and the user's build command
	 * is unlikely to expect that.
	 *
	 * @returns a promise that resolves once the queue has been drained.
	 */
	#scheduleCustomBuild(
		config: StartDevWorkerOptions,
		filePath: string
	): Promise<void> {
		// Watcher events can still be delivered between `teardown()` aborting the
		// in-flight build and the watcher finishing closing, and a build must never
		// outlive dev: it would spawn a process and dispatch bundle events into a
		// torn-down environment.
		if (this.tearingDown) {
			return Promise.resolve();
		}

		// If a new custom build comes in, we need to cancel in-flight builds
		this.#customBuildAborter.abort();
		this.#customBuildAborter = new AbortController();

		this.#pendingCustomBuild = {
			config,
			filePath,
			buildAborter: this.#customBuildAborter,
		};
		if (this.#customBuildDrain === undefined) {
			const drain = this.#drainCustomBuilds();
			this.#customBuildDrain = drain;
			// `#runCustomBuild()` reports build failures as error events, so the drain
			// should never reject. Guard against an unhandled rejection anyway, since
			// the file watcher doesn't await it.
			void drain.catch(() => {});
		}
		return this.#customBuildDrain;
	}

	async #drainCustomBuilds() {
		// Yield so that `#customBuildDrain` has been assigned before the loop below
		// can clear it.
		await Promise.resolve();
		try {
			while (this.#pendingCustomBuild !== undefined) {
				const next = this.#pendingCustomBuild;
				this.#pendingCustomBuild = undefined;
				// The request may have been superseded by a newer one, or dev may have
				// been torn down, while an earlier build was running.
				if (next.buildAborter.signal.aborted) {
					continue;
				}
				await this.#runCustomBuild(
					next.config,
					next.filePath,
					next.buildAborter
				);
			}
		} finally {
			this.#customBuildDrain = undefined;
		}
	}

	async #runCustomBuild(
		config: StartDevWorkerOptions,
		filePath: string,
		buildAborter: AbortController
	) {
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
				{ wranglerCommand: "dev", signal: buildAborter.signal }
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
						config.pythonModules?.exclude ?? [],
						config.build.findAdditionalModules !== false
					)
				: await bundleWorker(entry, this.#tmpDir.path, {
						bundle: true,
						additionalModules: [],
						moduleCollector,
						doBindings,
						workflowBindings,
						jsxFactory: config.build.jsxFactory,
						jsxFragment: config.build.jsxFragment,
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
			if (buildAborter.signal.aborted || isAbortError(err)) {
				return;
			}
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
		this.#customBuildWatcher = undefined;
		// Builds scheduled against the previous config must not run now that it has
		// been replaced.
		this.#debouncedCustomBuild?.cancel();
		this.#debouncedCustomBuild = undefined;
		this.#pendingCustomBuild = undefined;
		this.#customBuildAborter?.abort();

		// Closing the previous watcher suspends this method, so `teardown()` may
		// have run to completion in the meantime. It reads `#customBuildWatcher`
		// once, so a watcher created below would never be closed and would keep
		// the process alive.
		if (this.tearingDown || !config.build?.custom?.command) {
			return;
		}

		const pathsToWatch = config.build.custom.watch;

		// This is always present if a custom command is provided, defaulting to `./src`
		assert(pathsToWatch, "config.build.custom.watch");

		if (config.dev.watch === false) {
			await this.#scheduleCustomBuild(config, String(pathsToWatch));
			return;
		}

		this.#customBuildWatcher = watch(pathsToWatch, {
			persistent: true,
			// The initial custom build is always done in getEntry()
			ignoreInitial: true,
		});
		this.#customBuildWatcher.on("ready", () => {
			void this.#scheduleCustomBuild(config, String(pathsToWatch));
		});

		// A single logical change (a `git pull`, a "save all", a framework writing
		// out a directory) usually surfaces as a burst of watcher events. Debounce
		// them so that the burst results in one build rather than a build per event
		// that is immediately superseded by the next.
		let lastChangedPath = String(pathsToWatch);
		const debouncedCustomBuild = debounce(() => {
			void this.#scheduleCustomBuild(config, lastChangedPath);
		});
		this.#debouncedCustomBuild = debouncedCustomBuild;

		this.#customBuildWatcher.on("all", (_event, filePath) => {
			lastChangedPath = filePath;
			debouncedCustomBuild();
		});
	}

	#bundlerCleanup?: ReturnType<typeof runBuild>;
	#bundleBuildAborter = new AbortController();

	async #startBundle(config: StartDevWorkerOptions) {
		await this.#bundlerCleanup?.();
		// Cleaning up the previous build suspends this method, so `teardown()` may
		// have run to completion in the meantime. It reads `#bundlerCleanup` once,
		// so an esbuild watch build started below would never be disposed of. Bail
		// out before replacing the aborter, which `teardown()` has already aborted
		// to suppress events from in-flight builds.
		if (this.tearingDown) {
			return;
		}
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
				onRebuildError: (errors, warnings) => {
					if (!buildAborter.signal.aborted) {
						// Watch-mode rebuild failures route through the same error
						// path as initial-build failures, so DevEnv logs them
						// (logBuildFailure) and emits `buildFailed` symmetrically.
						this.emitErrorEvent({
							type: "error",
							reason: "Failed to rebuild the Worker",
							cause: new BuildFailure(
								`Build failed with ${errors.length} error(s)`,
								errors,
								warnings
							),
							source: "BundlerController",
							data: undefined,
						});
					}
				},
				checkFetch: shouldCheckFetch(
					config.compatibilityDate,
					config.compatibilityFlags
				),
				watch: config.dev.watch ?? true,
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
	#debouncedRefreshBundle?: ReturnType<typeof debounce>;

	async #ensureWatchingAssets(config: StartDevWorkerOptions) {
		await this.#assetsWatcher?.close();
		this.#assetsWatcher = undefined;
		// The watcher has closed, so no further events can arm the previous refresh.
		// Discard any that is still pending: it captured the config it was created
		// with, which has now been replaced.
		this.#debouncedRefreshBundle?.cancel();
		this.#debouncedRefreshBundle = undefined;

		// Closing the previous watcher suspends this method, so `teardown()` may
		// have run to completion in the meantime. It reads `#assetsWatcher` once,
		// so a watcher created below would never be closed and would keep the
		// process alive.
		if (this.tearingDown) {
			return;
		}

		const debouncedRefreshBundle = debounce(() => {
			// The watcher can deliver events while it is closing, so a refresh can be
			// armed after dev has stopped.
			if (this.tearingDown) {
				return;
			}
			if (this.#currentBundle) {
				this.emitBundleCompleteEvent(config, this.#currentBundle);
			}
		});
		this.#debouncedRefreshBundle = debouncedRefreshBundle;

		if (config.dev.watch !== false && config.assets?.directory) {
			const assetsDir = config.assets.directory;
			const watcher = watch(assetsDir, {
				persistent: true,
				ignoreInitial: true,
			})
				.on("all", async (eventName, filePath) => {
					const message = getAssetChangeMessage(eventName, filePath);
					logger.debug(`🌀 ${message}...`);
					debouncedRefreshBundle();
				})
				.on("error", (err) => {
					const errnoError = err as NodeJS.ErrnoException;
					if (errnoError.code === "EMFILE") {
						logger.warn(
							`Assets directory watcher hit a platform limit and has been disabled.\n` +
								`Hot-reloading will not reflect changes to files in ${assetsDir}.\n` +
								`This can occur when watching very large assets directory trees.\n` +
								`To work around this, reduce the number of subdirectories under ${assetsDir} by flattening or restructuring the assets directory.`
						);
					} else {
						logger.warn(
							`Assets directory watcher encountered an error and has been disabled.\n` +
								`Hot-reloading will not reflect changes to files in ${assetsDir}.\n` +
								`Watcher error: ${err.message}`
						);
					}
					void watcher.close();
					if (this.#assetsWatcher === watcher) {
						this.#assetsWatcher = undefined;
					}
				});
			this.#assetsWatcher = watcher;
		}
	}

	#tmpDir?: EphemeralDirectory;

	onConfigUpdate(event: ConfigUpdateEvent) {
		// A config update can arrive after teardown has finished: `DevEnv` tears its
		// controllers down concurrently, and `ConfigController` can dispatch a
		// config-file change delivered while its own watcher was closing. Acting on
		// it would create file watchers, an esbuild watch build and a temp directory
		// that nothing will ever clean up, all of which can keep the process alive
		// after dev has shut down.
		if (this.tearingDown) {
			logger.debug("Ignoring config update during teardown");
			return;
		}

		this.#tmpDir?.remove();
		try {
			this.#tmpDir = getWranglerTmpDir(event.config.projectRoot, "dev");
		} catch (e) {
			this.emitErrorEvent({
				type: "error",
				reason: "Failed to create temporary directory to store built files.",
				cause: castErrorCause(e),
				source: "BundlerController",
				data: undefined,
			});
		}

		void this.#startCustomBuild(event.config).catch((err) => {
			this.emitErrorEvent({
				type: "error",
				reason: "Failed to run custom build",
				cause: castErrorCause(err),
				source: "BundlerController",
				data: { config: event.config },
			});
		});
		void this.#startBundle(event.config).catch((err) => {
			this.emitErrorEvent({
				type: "error",
				reason: "Failed to start bundler",
				cause: castErrorCause(err),
				source: "BundlerController",
				data: { config: event.config },
			});
		});
		void this.#ensureWatchingAssets(event.config).catch((err) => {
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
		this.#pendingCustomBuild = undefined;
		this.#customBuildAborter?.abort();
		// Abort any in-flight esbuild build so that a finishing build doesn't
		// emit `bundleComplete`/`bundleStart` into a torn-down event bus.
		// `Controller.#tearingDown` already suppresses error events, but not
		// the bundler success events, which go straight through `bus.dispatch`.
		this.#bundleBuildAborter?.abort();
		await Promise.all([
			// Must run before `#tmpDir.remove()` so that the esbuild watcher
			// can dispose cleanly. Removing the directory first would make
			// esbuild's watcher fail a rebuild with "Could not resolve
			// ...middleware-loader.entry.ts" during teardown.
			this.#bundlerCleanup?.(),
			this.#customBuildWatcher?.close(),
			this.#customBuildDrain?.catch(() => {}),
			this.#assetsWatcher?.close(),
		]);
		// Discard any debounced work armed by an event that arrived while the
		// watchers were closing, so its timer doesn't keep the process alive. Must
		// run after the watchers have closed, otherwise a later event could re-arm it.
		this.#debouncedCustomBuild?.cancel();
		this.#debouncedRefreshBundle?.cancel();
		// Defence-in-depth: `bundle.ts`'s `stop()` normally removes the tmp
		// dir on our behalf, but it may have never been assigned (e.g. when
		// running a custom build, or when the initial build threw). Remove
		// after esbuild cleanup to avoid the race described above.
		this.#tmpDir?.remove();
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
