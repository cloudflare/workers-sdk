import assert from "node:assert";
import { watch } from "chokidar";
import { useApp } from "ink";
import { useState, useEffect } from "react";
import { rewriteNodeCompatBuildFailure } from "../deployment-bundle/build-failures";
import { bundleWorker } from "../deployment-bundle/bundle";
import { dedupeModulesByName } from "../deployment-bundle/dedupe-modules";
import findAdditionalModules from "../deployment-bundle/find-additional-modules";
import { logBuildFailure, logBuildWarnings } from "../logger";
import type { Config } from "../config";
import type { SourceMapMetadata } from "../deployment-bundle/bundle";
import type { Entry } from "../deployment-bundle/entry";
import type { CfModule } from "../deployment-bundle/worker";
import type { WorkerRegistry } from "../dev-registry";
import type { ModuleCollector } from "../module-collection";
import type { Metafile, BuildResult, PluginBuild } from "esbuild";

export type EsbuildBundle = {
	id: number;
	path: string;
	entry: Entry;
	type: "esm" | "commonjs";
	modules: CfModule[];
	dependencies: Metafile["outputs"][string]["inputs"];
	sourceMapPath: string | undefined;
	sourceMapMetadata: SourceMapMetadata | undefined;
};

export type BundleInfo = {
	bundle: EsbuildBundle;
	moduleCollector: ModuleCollector | undefined;
};

export function useEsbuild({
	entry,
	destination,
	jsxFactory,
	jsxFragment,
	processEntrypoint,
	additionalModules,
	rules,
	assets,
	serveAssetsFromWorker,
	tsconfig,
	minify,
	legacyNodeCompat,
	nodejsCompat,
	define,
	noBundle,
	workerDefinitions,
	services,
	durableObjects,
	local,
	targetConsumer,
	testScheduled,
	experimentalLocal,
}: {
	entry: Entry;
	destination: string | undefined;
	jsxFactory: string | undefined;
	jsxFragment: string | undefined;
	processEntrypoint: boolean;
	additionalModules: CfModule[];
	rules: Config["rules"];
	assets: Config["assets"];
	define: Config["define"];
	services: Config["services"];
	serveAssetsFromWorker: boolean;
	tsconfig: string | undefined;
	minify: boolean | undefined;
	legacyNodeCompat: boolean | undefined;
	nodejsCompat: boolean | undefined;
	noBundle: boolean;
	workerDefinitions: WorkerRegistry;
	durableObjects: Config["durable_objects"];
	local: boolean;
	targetConsumer: "dev" | "deploy";
	testScheduled: boolean;
	experimentalLocal: boolean | undefined;
}): EsbuildBundle | undefined {
	const [bundleInfo, setBundleInfo] = useState<BundleInfo>();
	const { exit } = useApp();
	useEffect(() => {
		let stopWatching: (() => void) | undefined = undefined;

		function updateBundle() {
			// nothing really changes here, so let's increment the id
			// to change the return object's identity
			setBundleInfo((previousBundle) => {
				assert(
					previousBundle,
					"Rebuild triggered with no previous build available"
				);
				previousBundle.bundle.modules = dedupeModulesByName([
					...previousBundle.bundle.modules,
					...(previousBundle.moduleCollector?.modules ?? []),
				]);
				return { ...previousBundle, id: previousBundle.bundle.id + 1 };
			});
		}

		let bundled = false;
		const onEnd = {
			name: "on-end",
			setup(b: PluginBuild) {
				b.onEnd((result: BuildResult) => {
					const errors = result.errors;
					const warnings = result.warnings;
					if (errors.length > 0) {
						if (!legacyNodeCompat) rewriteNodeCompatBuildFailure(result.errors);
						logBuildFailure(errors, warnings);
						return;
					}

					if (!bundled) {
						// First bundle, no need to update bundle
						bundled = true;
					} else {
						updateBundle();
					}

					if (warnings.length > 0) {
						logBuildWarnings(warnings);
					}
				});
			},
		};

		async function build() {
			if (!destination) return;

			let traverseModuleGraphResult:
				| Awaited<ReturnType<typeof bundleWorker>>
				| undefined;
			let bundleResult: Awaited<ReturnType<typeof bundleWorker>> | undefined;
			if (noBundle) {
				traverseModuleGraphResult = await findAdditionalModules(entry, rules);
			}

			if (processEntrypoint || !noBundle) {
				bundleResult = await bundleWorker(entry, destination, {
					bundle: !noBundle,
					disableModuleCollection: noBundle,
					serveAssetsFromWorker,
					jsxFactory,
					jsxFragment,
					rules,
					watch: true,
					tsconfig,
					minify,
					legacyNodeCompat,
					nodejsCompat,
					doBindings: durableObjects.bindings,
					define,
					checkFetch: true,
					assets,
					// disable the cache in dev
					bypassAssetCache: true,
					workerDefinitions,
					services,
					targetConsumer,
					testScheduled,
					additionalModules: dedupeModulesByName([
						...(traverseModuleGraphResult?.modules ?? []),
						...additionalModules,
					]),
					plugins: [onEnd],
					local,
				});
			}

			// Capture the `stop()` method to use as the `useEffect()` destructor.
			stopWatching = bundleResult?.stop;

			// if "noBundle" is true, then we need to manually watch the entry point and
			// trigger "builds" when it changes
			if (noBundle) {
				const watcher = watch(entry.file, {
					persistent: true,
				}).on("change", async (_event) => {
					updateBundle();
				});

				stopWatching = () => {
					void watcher.close();
				};
			}

			setBundleInfo({
				bundle: {
					id: 0,
					entry,
					path: bundleResult?.resolvedEntryPointPath ?? entry.file,
					type:
						bundleResult?.bundleType ??
						(entry.format === "modules" ? "esm" : "commonjs"),
					modules: bundleResult
						? bundleResult.modules
						: dedupeModulesByName([
								...(traverseModuleGraphResult?.modules ?? []),
								...additionalModules,
						  ]),
					dependencies: bundleResult?.dependencies ?? {},
					sourceMapPath: bundleResult?.sourceMapPath,
					sourceMapMetadata: bundleResult?.sourceMapMetadata,
				},
				moduleCollector: bundleResult?.moduleCollector,
			});
		}

		build().catch((err) => {
			// If esbuild fails on first run, we want to quit the process
			// since we can't recover from here
			// related: https://github.com/evanw/esbuild/issues/1037
			exit(err);
		});

		return () => {
			stopWatching?.();
		};
	}, [
		entry,
		destination,
		jsxFactory,
		jsxFragment,
		serveAssetsFromWorker,
		processEntrypoint,
		additionalModules,
		rules,
		tsconfig,
		exit,
		noBundle,
		minify,
		legacyNodeCompat,
		nodejsCompat,
		define,
		assets,
		services,
		durableObjects,
		workerDefinitions,
		local,
		targetConsumer,
		testScheduled,
		experimentalLocal,
	]);
	return bundleInfo?.bundle;
}
