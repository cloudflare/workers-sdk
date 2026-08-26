import * as fsp from "node:fs/promises";
import * as path from "node:path";
import {
	cleanBuildOutputDir,
	getWorkerAssetsDir,
	getWorkerBundleDir,
	writeSettingsConfig,
	writeWorkerConfig,
} from "@cloudflare/build-output-utils";
import { UserError } from "@cloudflare/workers-utils";
import type {
	ModuleType,
	ParsedInputSettingsConfig,
	ParsedInputWorkerConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";
import type { WorkerBuildResult } from "@cloudflare/deploy-helpers";
import type { AssetsOptions, CfModuleType } from "@cloudflare/workers-utils";

interface WriteBuildOutputArgs {
	root: string;
	parsedWorkerConfig: ParsedInputWorkerConfig;
	parsedSettingsConfig: ParsedInputSettingsConfig | undefined;
	/** The mode the build was produced in, recorded in the top-level config. */
	mode: string | undefined;
	buildResult: WorkerBuildResult | undefined;
	assetsOptions: AssetsOptions | undefined;
}

/**
 * Write the Worker's `.cloudflare/output/v0/workers/default/` directory
 * tree from an in-memory `WorkerBuildResult` and `AssetsOptions`.
 */
export async function writeBuildOutput({
	root,
	parsedWorkerConfig,
	parsedSettingsConfig,
	mode,
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
			? writeBundle({ root, buildResult })
			: Promise.resolve(undefined),
		assetsOptions ? writeAssets({ root, assetsOptions }) : Promise.resolve(),
	]);

	await writeWorkerConfig({ root, config: parsedWorkerConfig, manifest });
	await writeSettingsConfig(root, parsedSettingsConfig, mode);
}

async function writeBundle({
	root,
	buildResult,
}: {
	root: string;
	buildResult: WorkerBuildResult;
}): Promise<ParsedOutputWorkerConfig["manifest"]> {
	const bundleDir = getWorkerBundleDir(root);
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
	assetsOptions,
}: {
	root: string;
	assetsOptions: AssetsOptions;
}): Promise<void> {
	const assetsDir = getWorkerAssetsDir(root);
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
 * Build Output Specification's {@link ModuleType}.
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
