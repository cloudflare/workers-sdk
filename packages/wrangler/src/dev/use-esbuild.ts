import assert from "node:assert";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { watch } from "chokidar";
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
import type { SourceMapMetadata } from "../deployment-bundle/bundle";
import type { Entry } from "../deployment-bundle/entry";
import type { CfModule, CfModuleType, Config } from "@cloudflare/workers-utils";
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

export function runBuild(
	{
		entry,
		destination,
		jsxFactory,
		jsxFragment,
		processEntrypoint,
		additionalModules,
		rules,
		tsconfig,
		minify,
		keepNames,
		nodejsCompatMode,
		compatibilityDate,
		compatibilityFlags,
		define,
		alias,
		noBundle,
		findAdditionalModules,
		durableObjects,
		workflows,
		local,
		targetConsumer,
		testScheduled,
		projectRoot,
		onStart,
		defineNavigatorUserAgent,
		checkFetch,
		pythonModulesExcludes,
	}: {
		entry: Entry;
		destination: string | undefined;
		jsxFactory: string | undefined;
		jsxFragment: string | undefined;
		processEntrypoint: boolean;
		additionalModules: CfModule[];
		rules: Config["rules"];
		define: Config["define"];
		alias: Config["alias"];
		tsconfig: string | undefined;
		minify: boolean | undefined;
		keepNames: boolean;
		nodejsCompatMode: NodeJSCompatMode | undefined;
		compatibilityDate: string | undefined;
		compatibilityFlags: string[] | undefined;
		noBundle: boolean;
		findAdditionalModules: boolean | undefined;
		durableObjects: Config["durable_objects"];
		workflows: Config["workflows"];
		local: boolean;
		targetConsumer: "dev" | "deploy";
		testScheduled: boolean;
		projectRoot: string | undefined;
		onStart: () => void;
		defineNavigatorUserAgent: boolean;
		checkFetch: boolean;
		pythonModulesExcludes?: string[];
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
					...((await doFindAdditionalModules(
						entry,
						rules,
						false,
						pythonModulesExcludes ?? []
					)) ?? []),
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
						jsxFactory,
						jsxFragment,
						watch: true,
						tsconfig,
						minify,
						keepNames,
						nodejsCompatMode,
						compatibilityDate,
						compatibilityFlags,
						doBindings: durableObjects.bindings,
						workflowBindings: workflows,
						alias,
						define,
						targetConsumer,
						testScheduled,
						plugins: [logBuildOutput(nodejsCompatMode, onStart, updateBundle)],
						local,
						projectRoot,
						defineNavigatorUserAgent,

						// Pages specific options used by wrangler pages commands
						entryName: undefined,
						inject: undefined,
						isOutfile: undefined,
						external: undefined,

						// sourcemap defaults to true in dev
						sourcemap: undefined,
						checkFetch,

						metafile: undefined,
					})
				: undefined;

		// Capture the `stop()` method to use as the `useEffect()` destructor.
		stopWatching = bundleResult?.stop;

		// if "noBundle" is true, then we need to manually watch all modules and
		// trigger "builds" when any change
		if (noBundle) {
			const watching = [path.resolve(entry.moduleRoot)];
			// Check whether we need to watch a Python cf-requirements.txt file.
			const watchPythonRequirements =
				getBundleType(entry.format, entry.file) === "python"
					? path.resolve(entry.projectRoot, "cf-requirements.txt")
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
