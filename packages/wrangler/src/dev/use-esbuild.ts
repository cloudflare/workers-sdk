import assert from "node:assert";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { watch } from "chokidar";
import { useApp } from "ink";
import { useEffect, useState } from "react";
import { rewriteNodeCompatBuildFailure } from "../deployment-bundle/build-failures";
import { bundleWorker } from "../deployment-bundle/bundle";
import { getBundleType } from "../deployment-bundle/bundle-type";
import { dedupeModulesByName } from "../deployment-bundle/dedupe-modules";
import { findAdditionalModules as doFindAdditionalModules } from "../deployment-bundle/find-additional-modules";
import {
	createModuleCollector,
	getWrangler1xLegacyModuleReferences,
	noopModuleCollector,
} from "../deployment-bundle/module-collection";
import { logBuildFailure, logBuildWarnings } from "../logger";
import type { Config } from "../config";
import type { SourceMapMetadata } from "../deployment-bundle/bundle";
import type { Entry } from "../deployment-bundle/entry";
import type { NodeJSCompatMode } from "../deployment-bundle/node-compat";
import type { CfModule, CfModuleType } from "../deployment-bundle/worker";
import type { BuildResult, Metafile, PluginBuild } from "esbuild";

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
	assets: Config["assets"];
	define: Config["define"];
	alias: Config["alias"];
	serveAssetsFromWorker: boolean;
	tsconfig: string | undefined;
	minify: boolean | undefined;
	nodejsCompatMode: NodeJSCompatMode | undefined;
	noBundle: boolean;
	findAdditionalModules: boolean | undefined;
	durableObjects: Config["durable_objects"];
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
		assets,
		serveAssetsFromWorker,
		tsconfig,
		minify,
		nodejsCompatMode,
		define,
		alias,
		noBundle,
		findAdditionalModules,
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
		assets: Config["assets"];
		define: Config["define"];
		alias: Config["alias"];
		serveAssetsFromWorker: boolean;
		tsconfig: string | undefined;
		minify: boolean | undefined;
		nodejsCompatMode: NodeJSCompatMode | undefined;
		noBundle: boolean;
		findAdditionalModules: boolean | undefined;
		durableObjects: Config["durable_objects"];
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
	let stopWatching: (() => void) | undefined = undefined;

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

	let bundled = false;
	const onEnd = {
		name: "on-end",
		setup(b: PluginBuild) {
			b.onStart(() => {
				onStart();
			});
			b.onEnd(async (result: BuildResult) => {
				const errors = result.errors;
				const warnings = result.warnings;
				if (errors.length > 0) {
					if (nodejsCompatMode !== "legacy") {
						rewriteNodeCompatBuildFailure(result.errors);
					}
					logBuildFailure(errors, warnings);
					return;
				}

				if (warnings.length > 0) {
					logBuildWarnings(warnings);
				}

				if (!bundled) {
					// First bundle, no need to update bundle
					bundled = true;
				} else {
					await updateBundle();
				}
			});
		},
	};

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
						serveAssetsFromWorker,
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
						assets,
						// disable the cache in dev
						bypassAssetCache: true,
						targetConsumer,
						testScheduled,
						plugins: [onEnd],
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

			stopWatching = () => {
				void watcher.close();
			};
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

	return () => {
		stopWatching?.();
	};
}

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
	nodejsCompatMode,
	alias,
	define,
	noBundle,
	findAdditionalModules,
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
		return runBuild(
			{
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
				nodejsCompatMode,
				alias,
				define,
				noBundle,
				findAdditionalModules,
				durableObjects,
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
		findAdditionalModules,
		minify,
		nodejsCompatMode,
		alias,
		define,
		assets,
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
