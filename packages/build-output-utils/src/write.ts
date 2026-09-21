import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import {
	BUILD_OUTPUT_ROOT,
	DEFAULT_WORKER_DIRECTORY_NAME,
	getBuildOutputDir,
	getContainerConfigPath,
	getContainerDir,
	getSettingsConfigPath,
	getWorkerAssetsDir,
	getWorkerConfigPath,
	getWorkerDir,
} from "./paths";
import type {
	ParsedInputSettingsConfig,
	ParsedInputWorkerConfig,
	ParsedOutputContainerConfig,
	ParsedOutputSettingsConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";

/**
 * Clean the build output directory.
 */
export async function cleanBuildOutputDir(root: string): Promise<void> {
	await removeDir(getBuildOutputDir(root));
}

export interface WriteAssetsOptions {
	root: string;
	sourceDirectory: string;
}

/**
 * Copy static assets into the Build Output Specification tree.
 *
 * When the project root is itself the asset source, the reserved
 * `.cloudflare` directory is omitted so the nested output is not copied into
 * itself.
 */
export async function writeAssets({
	root,
	sourceDirectory,
}: WriteAssetsOptions): Promise<void> {
	const assetsDir = getWorkerAssetsDir(root);
	await fsp.mkdir(assetsDir, { recursive: true });

	if (path.resolve(sourceDirectory) !== path.resolve(root)) {
		await fsp.cp(sourceDirectory, assetsDir, {
			recursive: true,
			force: false,
		});
		return;
	}

	const entries = await fsp.readdir(sourceDirectory);
	await Promise.all(
		entries
			.filter((entry) => entry !== path.dirname(BUILD_OUTPUT_ROOT))
			.map((entry) =>
				fsp.cp(path.join(sourceDirectory, entry), path.join(assetsDir, entry), {
					recursive: true,
					force: false,
				})
			)
	);
}

export interface WriteWorkerConfigOptions {
	root: string;
	config: ParsedInputWorkerConfig;
	manifest?: ParsedOutputWorkerConfig["manifest"];
	directoryName?: string;
}

/**
 * Write an output Worker `config.json` to the Build Output Specification tree.
 *
 * - Workers mode: `manifest` is provided (bundle/ present on disk).
 * - Assets-only mode: `manifest` is omitted (no bundle/ directory).
 */
export async function writeWorkerConfig({
	root,
	config,
	manifest,
	directoryName = DEFAULT_WORKER_DIRECTORY_NAME,
}: WriteWorkerConfigOptions): Promise<void> {
	const { entrypoint: _entrypoint, ...rest } = config;
	const outputConfig: ParsedOutputWorkerConfig = { ...rest, manifest };
	await fsp.mkdir(getWorkerDir(root, directoryName), { recursive: true });
	await fsp.writeFile(
		getWorkerConfigPath(root, directoryName),
		JSON.stringify(outputConfig)
	);
}

export interface WriteContainerConfigOptions {
	root: string;
	config: ParsedOutputContainerConfig;
	directoryName: string;
}

/**
 * Write an output Container `config.json` to the Build Output Specification
 * tree.
 *
 * Local Dockerfiles must already have been built and represented by a
 * `localReference` in the output config.
 */
export async function writeContainerConfig({
	root,
	config,
	directoryName,
}: WriteContainerConfigOptions): Promise<void> {
	await fsp.mkdir(getContainerDir(root, directoryName), {
		recursive: true,
	});
	await fsp.writeFile(
		getContainerConfigPath(root, directoryName),
		JSON.stringify(config)
	);
}

/**
 * Write the top-level `config.json` to the Build Output Specification tree.
 *
 * Holds the project-level settings shared by every Worker: those declared by
 * the `settings` export, including the `mode`, which is supplied at build time
 * rather than declared. Always written, even when there are no declared
 * settings and no mode: the result then degrades to `{ "type": "settings" }`.
 *
 * `mode` is omitted when undefined, which is the case for Wrangler builds that
 * selected no mode (Vite always resolves one).
 */
export async function writeSettingsConfig(
	root: string,
	settings: ParsedInputSettingsConfig | undefined,
	mode?: string
): Promise<void> {
	const outputConfig: ParsedOutputSettingsConfig = {
		...settings,
		type: "settings",
		...(mode !== undefined ? { mode } : {}),
	};
	const configPath = getSettingsConfigPath(root);
	await fsp.mkdir(path.dirname(configPath), { recursive: true });
	await fsp.writeFile(configPath, JSON.stringify(outputConfig));
}
