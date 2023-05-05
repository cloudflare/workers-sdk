import assert from "node:assert";
import { watch } from "chokidar";
import { useApp } from "ink";
import { useState, useEffect } from "react";
import { bundleWorker, rewriteNodeCompatBuildFailure } from "../bundle";
import { logBuildFailure, logger } from "../logger";
import traverseModuleGraph from "../traverse-module-graph";
import type { Config } from "../config";
import type { WorkerRegistry } from "../dev-registry";
import type { Entry } from "../entry";
import type { SourceMapMetadata } from "../inspect";
import type { CfModule } from "../worker";
import type { WatchMode, Metafile } from "esbuild";

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

export function useEsbuild({
	entry,
	destination,
	jsxFactory,
	jsxFragment,
	processEntrypoint,
	rules,
	assets,
	serveAssetsFromWorker,
	tsconfig,
	minify,
	legacyNodeCompat,
	nodejsCompat,
	betaD1Shims,
	define,
	noBundle,
	workerDefinitions,
	services,
	durableObjects,
	firstPartyWorkerDevFacade,
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
	rules: Config["rules"];
	assets: Config["assets"];
	define: Config["define"];
	services: Config["services"];
	serveAssetsFromWorker: boolean;
	tsconfig: string | undefined;
	minify: boolean | undefined;
	legacyNodeCompat: boolean | undefined;
	nodejsCompat: boolean | undefined;
	betaD1Shims?: string[];
	noBundle: boolean;
	workerDefinitions: WorkerRegistry;
	durableObjects: Config["durable_objects"];
	firstPartyWorkerDevFacade: boolean | undefined;
	local: boolean;
	targetConsumer: "dev" | "publish";
	testScheduled: boolean;
	experimentalLocal: boolean | undefined;
}): EsbuildBundle | undefined {
	const [bundle, setBundle] = useState<EsbuildBundle>();
	const { exit } = useApp();
	useEffect(() => {
		let stopWatching: (() => void) | undefined = undefined;

		function updateBundle() {
			// nothing really changes here, so let's increment the id
			// to change the return object's identity
			setBundle((previousBundle) => {
				assert(
					previousBundle,
					"Rebuild triggered with no previous build available"
				);
				return { ...previousBundle, id: previousBundle.id + 1 };
			});
		}

		const watchMode: WatchMode = {
			async onRebuild(error) {
				if (error !== null) {
					if (!legacyNodeCompat) rewriteNodeCompatBuildFailure(error);
					logBuildFailure(error);
					logger.error("Watch build failed:", error.message);
				} else {
					updateBundle();
				}
			},
		};

		async function build() {
			if (!destination) return;

			let traverseModuleGraphResult:
				| Awaited<ReturnType<typeof bundleWorker>>
				| undefined;
			let bundleResult: Awaited<ReturnType<typeof bundleWorker>> | undefined;
			if (noBundle) {
				traverseModuleGraphResult = await traverseModuleGraph(entry, rules);
			}

			if (processEntrypoint || !noBundle) {
				bundleResult = await bundleWorker(entry, destination, {
					bundle: !noBundle,
					disableModuleCollection: noBundle,
					serveAssetsFromWorker,
					jsxFactory,
					jsxFragment,
					rules,
					watch: watchMode,
					tsconfig,
					minify,
					legacyNodeCompat,
					nodejsCompat,
					betaD1Shims,
					doBindings: durableObjects.bindings,
					define,
					checkFetch: true,
					assets: assets && {
						...assets,
						// disable the cache in dev
						bypassCache: true,
					},
					workerDefinitions,
					services,
					firstPartyWorkerDevFacade,
					local,
					targetConsumer,
					testScheduled,
					experimentalLocal,
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
			setBundle({
				id: 0,
				entry,
				path: bundleResult?.resolvedEntryPointPath ?? entry.file,
				type:
					bundleResult?.bundleType ??
					(entry.format === "modules" ? "esm" : "commonjs"),
				modules:
					traverseModuleGraphResult?.modules ?? bundleResult?.modules ?? [],
				dependencies: bundleResult?.dependencies ?? {},
				sourceMapPath: bundleResult?.sourceMapPath,
				sourceMapMetadata: bundleResult?.sourceMapMetadata,
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
		firstPartyWorkerDevFacade,
		betaD1Shims,
		local,
		targetConsumer,
		testScheduled,
		experimentalLocal,
	]);
	return bundle;
}
