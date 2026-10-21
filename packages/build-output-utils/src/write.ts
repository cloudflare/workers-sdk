import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import {
	DEFAULT_WORKER_DIRECTORY_NAME,
	getBuildOutputDir,
	getContainerConfigPath,
	getContainerDir,
	getRootConfigPath,
	getWorkerAssetsDir,
	getWorkerConfigPath,
	getWorkerDir,
} from "./paths";
import type { BuildOutputOptions } from "./paths";
import type {
	ParsedInputSettingsConfig,
	ParsedInputWorkerConfig,
	ParsedOutputContainerConfig,
	ParsedOutputRootConfig,
	ParsedOutputWorkerConfig,
	ConfigContext,
} from "@cloudflare/config";

/**
 * Clean the build output directory.
 */
export async function cleanBuildOutputDir(
	root: string,
	options?: BuildOutputOptions
): Promise<void> {
	await removeDir(getBuildOutputDir(root, options));
}

export interface WriteAssetsOptions extends BuildOutputOptions {
	root: string;
	sourceDirectory: string;
}

/**
 * Copy static assets into the Build Output Specification tree.
 *
 * Symlinks are dereferenced so the output remains portable and self-contained.
 *
 * When the asset source contains the output, its containing directory is
 * omitted so the nested output is not copied into itself.
 */
export async function writeAssets({
	root,
	outputDirectory,
	sourceDirectory,
}: WriteAssetsOptions): Promise<void> {
	const assetsDir = getWorkerAssetsDir(root, undefined, { outputDirectory });
	await fsp.mkdir(assetsDir, { recursive: true });

	const outputDir = getBuildOutputDir(root, { outputDirectory });
	const relativeOutput = path.relative(
		path.resolve(sourceDirectory),
		outputDir
	);
	// Omit the output's containing directory when the source is an ancestor,
	// so copying project assets cannot recursively copy the build into itself.
	const excluded =
		relativeOutput !== ".." &&
		!relativeOutput.startsWith(`..${path.sep}`) &&
		!path.isAbsolute(relativeOutput)
			? relativeOutput.split(path.sep)[0]
			: undefined;
	if (relativeOutput === "") {
		throw new Error("The asset source cannot be the Build Output directory.");
	}
	const entries = await fsp.readdir(sourceDirectory);
	await Promise.all(
		entries
			.filter((entry) => entry !== excluded)
			.map((entry) =>
				fsp.cp(path.join(sourceDirectory, entry), path.join(assetsDir, entry), {
					recursive: true,
					force: false,
					dereference: true,
				})
			)
	);
}

export interface WriteWorkerConfigOptions extends BuildOutputOptions {
	root: string;
	config: ParsedInputWorkerConfig;
	manifest?: ParsedOutputWorkerConfig["manifest"];
	directoryName?: string;
}

/**
 * Write an output Worker `worker.config.json` to the Build Output Specification
 * tree.
 *
 * - Workers mode: `manifest` is provided (bundle/ present on disk).
 * - Assets-only mode: `manifest` is omitted (no bundle/ directory).
 */
export async function writeWorkerConfig({
	root,
	outputDirectory,
	config,
	manifest,
	directoryName = DEFAULT_WORKER_DIRECTORY_NAME,
}: WriteWorkerConfigOptions): Promise<void> {
	const { entrypoint: _entrypoint, ...rest } = config;
	const outputConfig: ParsedOutputWorkerConfig = { ...rest, manifest };
	await fsp.mkdir(getWorkerDir(root, directoryName, { outputDirectory }), {
		recursive: true,
	});
	await fsp.writeFile(
		getWorkerConfigPath(root, directoryName, { outputDirectory }),
		JSON.stringify(outputConfig)
	);
}

export interface WriteContainerConfigOptions extends BuildOutputOptions {
	root: string;
	config: ParsedOutputContainerConfig;
	directoryName: string;
}

/**
 * Write an output Container `container.config.json` to the Build Output
 * Specification tree.
 *
 * Local Dockerfiles must already have been built and represented by a
 * `localReference` in the output config.
 */
export async function writeContainerConfig({
	root,
	outputDirectory,
	config,
	directoryName,
}: WriteContainerConfigOptions): Promise<void> {
	await fsp.mkdir(getContainerDir(root, directoryName, { outputDirectory }), {
		recursive: true,
	});
	await fsp.writeFile(
		getContainerConfigPath(root, directoryName, { outputDirectory }),
		JSON.stringify(config)
	);
}

/**
 * Write the root `config.json` to the Build Output Specification tree.
 *
 * Holds the settings declared at the top level of `cloudflare.config.ts` and
 * build context supplied at build time.
 */
export async function writeRootConfig(
	root: string,
	settings: ParsedInputSettingsConfig | undefined,
	buildContext: ConfigContext,
	options?: BuildOutputOptions
): Promise<void> {
	const outputConfig: ParsedOutputRootConfig = {
		...settings,
		buildContext,
	};
	const configPath = getRootConfigPath(root, options);
	await fsp.mkdir(path.dirname(configPath), { recursive: true });
	await fsp.writeFile(configPath, JSON.stringify(outputConfig));
}
