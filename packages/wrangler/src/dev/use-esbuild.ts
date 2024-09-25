import assert from "node:assert";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { watch } from "chokidar";
import { useApp } from "ink";
import { useEffect, useState } from "react";
import { bundleWorker } from "../deployment-bundle/bundle";
import { getBundleType } from "../deployment-bundle/bundle-type";
import { dedupeModulesByName } from "../deployment-bundle/dedupe-modules";
import { logBuildOutput } from "../deployment-bundle/esbuild-plugins/log-build-output";
import { findAdditionalModules as doFindAdditionalModules } from "../deployment-bundle/find-additional-modules";
import {
	createModuleCollector,
	getWrangler1xLegacyModuleReferences,
	noopModuleCollector,
} from "../deployment-bundle/module-collection";
import type { Config } from "../config";
import type { SourceMapMetadata } from "../deployment-bundle/bundle";
import type { Entry } from "../deployment-bundle/entry";
import type { CfModule, CfModuleType } from "../deployment-bundle/worker";
import type { Metafile } from "esbuild";
import type { NodeJSCompatMode } from "miniflare";

export type EsbuildBundle = {
	id: number;
	path: string;
	entrypointSource: string;
	entry: Entry;
	type: CfModuleType;
	modules: CfModule[];
	dependencies: Metafile["outputs"][string]["inputs"];
	sourceMapPath: string | undefined;
	sourceMapMetadata: SourceMapMetadata | undefined;
};

export type EsbuildBundleProps = {
	entry: Entry;
	destination: string | undefined;
	jsxFactory: string | undefined;
	jsxFragment: string | undefined;
	processEntrypoint: boolean;
	additionalModules: CfModule[];
	rules: Config["rules"];
	legacyAssets: Config["legacy_assets"];
	define: Config["define"];
	alias: Config["alias"];
	serveLegacyAssetsFromWorker: boolean;
	tsconfig: string | undefined;
	minify: boolean | undefined;
	nodejsCompatMode: NodeJSCompatMode | undefined;
	noBundle: boolean;
	findAdditionalModules: boolean | undefined;
	durableObjects: Config["durable_objects"];
	mockAnalyticsEngineDatasets: Config["analytics_engine_datasets"];
	local: boolean;
	targetConsumer: "dev" | "deploy";
	testScheduled: boolean;
	projectRoot: string | undefined;
	onStart: () => void;
	onComplete: (bundle: EsbuildBundle) => void;
	defineNavigatorUserAgent: boolean;
};

export function runBuild(
	{
		entry,
		destination,
		jsxFactory,
		jsxFragment,
		processEntrypoint,
		additionalModules,
		rules,
		legacyAssets,
		serveLegacyAssetsFromWorker,
		tsconfig,
		minify,
		nodejsCompatMode,
		define,
		alias,
		noBundle,
		findAdditionalModules,
		mockAnalyticsEngineDatasets,
		durableObjects,
		local,
		targetConsumer,
		testScheduled,
		projectRoot,
		onStart,
		defineNavigatorUserAgent,
	}: {
		entry: Entry;
		destination: string | undefined;
		jsxFactory: string | undefined;
		jsxFragment: string | undefined;
		processEntrypoint: boolean;
		additionalModules: CfModule[];
		rules: Config["rules"];
		legacyAssets: Config["legacy_assets"];
		define: Config["define"];
		alias: Config["alias"];
		serveLegacyAssetsFromWorker: boolean;
		tsconfig: string | undefined;
		minify: boolean | undefined;
		nodejsCompatMode: NodeJSCompatMode | undefined;
		noBundle: boolean;
		findAdditionalModules: boolean | undefined;
		durableObjects: Config["durable_objects"];
		mockAnalyticsEngineDatasets: Config["analytics_engine_datasets"];
		local: boolean;
		targetConsumer: "dev" | "deploy";
		testScheduled: boolean;
		projectRoot: string | undefined;
		onStart: () => void;
		defineNavigatorUserAgent: boolean;
	},
	setBundle: (
		cb: (previous: EsbuildBundle | undefined) => EsbuildBundle
	) => void,
	onErr: (err: Error) => void
) {
	let stopWatching: (() => Promise<void>) | undefined = undefined;

	const entryDirectory = path.dirname(entry.file);
	const moduleCollector = noBundle
		? noopModuleCollector
		: createModuleCollector({
				wrangler1xLegacyModuleReferences: getWrangler1xLegacyModuleReferences(
					entryDirectory,
					entry.file
				),
				entry,
				findAdditionalModules: findAdditionalModules ?? false,
				rules: rules,
			});

	async function getAdditionalModules() {
		return noBundle
			? dedupeModulesByName([
					...((await doFindAdditionalModules(entry, rules)) ?? []),
					...additionalModules,
				])
			: additionalModules;
	}

	async function updateBundle() {
		const newAdditionalModules = await getAdditionalModules();
		// nothing really changes here, so let's increment the id
		// to change the return object's identity
		setBundle((previousBundle) => {
			assert(
				previousBundle,
				"Rebuild triggered with no previous build available"
			);
			previousBundle.modules = dedupeModulesByName([
				...(moduleCollector?.modules ?? []),
				...newAdditionalModules,
			]);
			return {
				...previousBundle,
				entrypointSource: readFileSync(previousBundle.path, "utf8"),
				id: previousBundle.id + 1,
			};
		});
	}

	async function build() {
		if (!destination) {
			return;
		}

		const newAdditionalModules = await getAdditionalModules();
		const bundleResult =
			processEntrypoint || !noBundle
				? await bundleWorker(entry, destination, {
						bundle: !noBundle,
						moduleCollector,
						additionalModules: newAdditionalModules,
						serveLegacyAssetsFromWorker,
						jsxFactory,
						jsxFragment,
						watch: true,
						tsconfig,
						minify,
						nodejsCompatMode,
						doBindings: durableObjects.bindings,
						alias,
						define,
						checkFetch: true,
						mockAnalyticsEngineDatasets,
						legacyAssets,
						// disable the cache in dev
						bypassAssetCache: true,
						targetConsumer,
						testScheduled,
						plugins: [logBuildOutput(nodejsCompatMode, onStart, updateBundle)],
						local,
						projectRoot,
						defineNavigatorUserAgent,
					})
				: undefined;

		// Capture the `stop()` method to use as the `useEffect()` destructor.
		stopWatching = bundleResult?.stop;

		// if "noBundle" is true, then we need to manually watch all modules and
		// trigger "builds" when any change
		if (noBundle) {
			const watching = [path.resolve(entry.moduleRoot)];
			// Check whether we need to watch a Python requirements.txt file.
			const watchPythonRequirements =
				getBundleType(entry.format, entry.file) === "python"
					? path.resolve(entry.directory, "requirements.txt")
					: undefined;

			if (watchPythonRequirements) {
				watching.push(watchPythonRequirements);
			}

			const watcher = watch(watching, {
				persistent: true,
				ignored: [".git", "node_modules"],
			}).on("change", async (_event) => {
				await updateBundle();
			});

			stopWatching = () => watcher.close();
		}
		const entrypointPath = realpathSync(
			bundleResult?.resolvedEntryPointPath ?? entry.file
		);
		setBundle(() => ({
			id: 0,
			entry,
			path: entrypointPath,
			type: bundleResult?.bundleType ?? getBundleType(entry.format, entry.file),
			modules: bundleResult ? bundleResult.modules : newAdditionalModules,
			dependencies: bundleResult?.dependencies ?? {},
			sourceMapPath: bundleResult?.sourceMapPath,
			sourceMapMetadata: bundleResult?.sourceMapMetadata,
			entrypointSource: readFileSync(entrypointPath, "utf8"),
		}));
	}

	build().catch((err) => {
		// If esbuild fails on first run, we want to quit the process
		// since we can't recover from here
		// related: https://github.com/evanw/esbuild/issues/1037
		onErr(err);
	});

	return () => stopWatching?.();
}

export function useEsbuild({
	entry,
	destination,
	jsxFactory,
	jsxFragment,
	processEntrypoint,
	additionalModules,
	rules,
	legacyAssets,
	serveLegacyAssetsFromWorker,
	tsconfig,
	minify,
	nodejsCompatMode,
	alias,
	define,
	noBundle,
	findAdditionalModules,
	mockAnalyticsEngineDatasets,
	durableObjects,
	local,
	targetConsumer,
	testScheduled,
	projectRoot,
	onStart,
	onComplete,
	defineNavigatorUserAgent,
}: EsbuildBundleProps): EsbuildBundle | undefined {
	const [bundle, setBundle] = useState<EsbuildBundle>();
	const { exit } = useApp();
	useEffect(() => {
		const stopWatching = runBuild(
			{
				entry,
				destination,
				jsxFactory,
				jsxFragment,
				processEntrypoint,
				additionalModules,
				rules,
				legacyAssets,
				serveLegacyAssetsFromWorker,
				tsconfig,
				minify,
				nodejsCompatMode,
				alias,
				define,
				noBundle,
				findAdditionalModules,
				durableObjects,
				mockAnalyticsEngineDatasets,
				local,
				targetConsumer,
				testScheduled,
				projectRoot,
				onStart,
				defineNavigatorUserAgent,
			},
			setBundle,
			(err) => exit(err)
		);

		return () => {
			void stopWatching();
		};
	}, [
		entry,
		destination,
		jsxFactory,
		jsxFragment,
		serveLegacyAssetsFromWorker,
		processEntrypoint,
		additionalModules,
		rules,
		tsconfig,
		exit,
		noBundle,
		findAdditionalModules,
		minify,
		nodejsCompatMode,
		alias,
		define,
		legacyAssets,
		mockAnalyticsEngineDatasets,
		durableObjects,
		local,
		targetConsumer,
		testScheduled,
		projectRoot,
		onStart,
		defineNavigatorUserAgent,
	]);

	useEffect(() => {
		if (bundle) {
			onComplete(bundle);
		}
	}, [onComplete, bundle]);

	return bundle;
}
