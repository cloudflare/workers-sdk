import * as fsp from "node:fs/promises";
import * as path from "node:path";
import {
	cleanBuildOutputDir,
	getWorkerAssetsDir,
	getWorkerBundleDir,
	writeOutputWorkerConfig,
} from "@cloudflare/config";
import { UserError } from "@cloudflare/workers-utils";
import type {
	ModuleType,
	ParsedInputWorkerConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";
import type { WorkerBuildResult } from "@cloudflare/deploy-helpers";
import type { AssetsOptions, CfModuleType } from "@cloudflare/workers-utils";

interface WriteBuildOutputArgs {
	root: string;
	parsedWorkerConfig: ParsedInputWorkerConfig;
	buildResult: WorkerBuildResult | undefined;
	assetsOptions: AssetsOptions | undefined;
}

/**
 * Write a Worker's `.cloudflare/output/v0/workers/<name>/` directory
 * tree from an in-memory `WorkerBuildResult` and `AssetsOptions`.
 */
export async function writeBuildOutput({
	root,
	parsedWorkerConfig,
	buildResult,
	assetsOptions,
}: WriteBuildOutputArgs): Promise<void> {
	if (buildResult === undefined && assetsOptions === undefined) {
		throw new UserError(
			"Cannot emit build output: the Worker has no entrypoint and no assets directory.",
			{ telemetryMessage: "build output missing entrypoint and assets" }
		);
	}
	await cleanBuildOutputDir(root);

	const [manifest] = await Promise.all([
		buildResult
			? writeBundle({
					root,
					workerName: parsedWorkerConfig.name,
					buildResult,
				})
			: Promise.resolve(undefined),
		assetsOptions
			? writeAssets({
					root,
					workerName: parsedWorkerConfig.name,
					assetsOptions,
				})
			: Promise.resolve(),
	]);

	await writeOutputWorkerConfig(root, parsedWorkerConfig, manifest);
}

async function writeBundle({
	root,
	workerName,
	buildResult,
}: {
	root: string;
	workerName: string;
	buildResult: WorkerBuildResult;
}): Promise<ParsedOutputWorkerConfig["manifest"]> {
	const bundleDir = getWorkerBundleDir(root, workerName);
	await fsp.mkdir(bundleDir, { recursive: true });

	const modules: NonNullable<ParsedOutputWorkerConfig["manifest"]>["modules"] =
		{};

	// Entry module
	const entryKey = stripLeadingDotSlash(
		path.basename(buildResult.resolvedEntryPointPath)
	);
	await writeBundleFile(bundleDir, entryKey, buildResult.content);
	modules[entryKey] = { type: toManifestType(buildResult.bundleType) };

	// Additional / collected modules.
	for (const module of buildResult.modules) {
		const key = stripLeadingDotSlash(module.name);
		await writeBundleFile(bundleDir, key, module.content);
		modules[key] = {
			type: toManifestType(module.type ?? buildResult.bundleType),
		};
	}

	// Source maps. `buildResult.sourceMaps` is already gated by
	// `uploadSourceMaps` inside `buildWorker` (undefined when off) and
	// contains the main module's map plus any module maps, each named
	// `<module>.map` (e.g. `index.js.map`).
	for (const sourceMap of buildResult.sourceMaps ?? []) {
		const key = stripLeadingDotSlash(sourceMap.name);
		await writeBundleFile(bundleDir, key, sourceMap.content);
		modules[key] = { type: "sourcemap" };
	}

	return { mainModule: entryKey, modules };
}

async function writeAssets({
	root,
	workerName,
	assetsOptions,
}: {
	root: string;
	workerName: string;
	assetsOptions: AssetsOptions;
}): Promise<void> {
	const assetsDir = getWorkerAssetsDir(root, workerName);
	await fsp.mkdir(assetsDir, { recursive: true });
	await fsp.cp(assetsOptions.directory, assetsDir, {
		recursive: true,
	});
}

async function writeBundleFile(
	bundleDir: string,
	key: string,
	content: string | Buffer | Uint8Array
): Promise<void> {
	const target = path.join(bundleDir, key);
	await fsp.mkdir(path.dirname(target), { recursive: true });
	await fsp.writeFile(target, content);
}

function stripLeadingDotSlash(name: string): string {
	return name.startsWith("./") ? name.slice(2) : name;
}

/**
 * Map Wrangler's internal {@link CfModuleType} to the
 * Build Output API's {@link ModuleType}.
 */
function toManifestType(cfType: CfModuleType): ModuleType {
	switch (cfType) {
		case "esm":
			return "esm";
		case "commonjs":
			return "cjs";
		case "compiled-wasm":
			return "wasm";
		case "text":
			return "text";
		case "buffer":
			return "data";
		case "python":
			return "python";
		case "python-requirement":
			return "python-requirement";
	}
}
