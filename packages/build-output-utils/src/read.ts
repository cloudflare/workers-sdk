import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import { OutputWorkerSchema, SettingsSchema } from "@cloudflare/config";
import { BuildOutputError } from "./errors";
import {
	BUILD_OUTPUT_VERSION,
	getRootConfigPath,
	getWorkerAssetsDir,
	getWorkerBundleDir,
	getWorkerConfigPath,
} from "./paths";
import type {
	ParsedOutputWorkerConfig,
	ParsedSettingsConfig,
} from "@cloudflare/config";

/**
 * The Worker found in the Build Output Specification tree.
 *
 * `bundleDir` / `assetsDir` are resolved to `undefined` when the corresponding
 * directory is absent on disk, so consumers don't need their own existence
 * checks.
 */
export interface BuildOutputWorker {
	/** Absolute path to the Worker's `config.json`. */
	configPath: string;
	/** The parsed, schema-validated Worker config, including its `manifest`. */
	config: ParsedOutputWorkerConfig;
	/** Absolute path to the Worker's `bundle/` directory, if present. */
	bundleDir: string | undefined;
	/** Absolute path to the Worker's `assets/` directory, if present. */
	assetsDir: string | undefined;
}

/**
 * The result of reading a Build Output Specification tree.
 */
export interface BuildOutput {
	/** Project root the output was read from. */
	root: string;
	/** Version of the spec the tree conforms to. */
	version: string;
	/**
	 * Project-level settings from the optional top-level `config.json`
	 * (shared by every Worker), or `undefined` when the file is absent.
	 */
	settings: ParsedSettingsConfig | undefined;
	/**
	 * The Workers found under `<root>/.cloudflare/output/v0/workers/`.
	 * Guaranteed to contain at least one Worker; currently always exactly one.
	 */
	workers: [BuildOutputWorker, ...BuildOutputWorker[]];
}

/**
 * Read and validate the Build Output Specification tree at
 * `<root>/.cloudflare/output/v0/`.
 *
 * Reads the optional top-level `config.json` settings, then reads and
 * schema-validates the Worker's `config.json` and resolves its
 * `bundle/` / `assets/` directories.
 *
 * @throws {BuildOutputError} if the top-level `config.json` is invalid, or if
 * the Worker config is missing, is not valid JSON, or fails schema validation.
 */
export async function readBuildOutput(root: string): Promise<BuildOutput> {
	const settings = await readSettings(root);
	const worker = await readWorker(root);

	return { root, version: BUILD_OUTPUT_VERSION, settings, workers: [worker] };
}

/**
 * Read and schema-validate the Worker's `config.json` and resolve its
 * `bundle/` / `assets/` directories.
 *
 * @throws {BuildOutputError} if the config is missing, is not valid JSON, or
 * fails schema validation.
 */
async function readWorker(root: string): Promise<BuildOutputWorker> {
	const configPath = getWorkerConfigPath(root);

	if (!fs.existsSync(configPath)) {
		throw new BuildOutputError(`No Worker config found at ${configPath}.`);
	}

	const contents = await fsp.readFile(configPath, "utf-8");
	const result = OutputWorkerSchema.safeParse(parseJson(contents, configPath));
	if (!result.success) {
		throw new BuildOutputError(
			`Build Output Specification: invalid Worker config at ${configPath}.\n${result.error.message}`
		);
	}

	const bundleDir = getWorkerBundleDir(root);
	const assetsDir = getWorkerAssetsDir(root);

	return {
		configPath,
		config: result.data,
		bundleDir: fs.existsSync(bundleDir) ? bundleDir : undefined,
		assetsDir: fs.existsSync(assetsDir) ? assetsDir : undefined,
	};
}

/**
 * Read and schema-validate the optional top-level `config.json` holding the
 * project-level settings shared by every Worker.
 *
 * @returns the parsed settings, or `undefined` when the file is absent.
 * @throws {BuildOutputError} if the file is not valid JSON or fails schema
 * validation.
 */
async function readSettings(
	root: string
): Promise<ParsedSettingsConfig | undefined> {
	const configPath = getRootConfigPath(root);

	if (!fs.existsSync(configPath)) {
		return undefined;
	}

	const contents = await fsp.readFile(configPath, "utf-8");
	const result = SettingsSchema.safeParse(parseJson(contents, configPath));
	if (!result.success) {
		throw new BuildOutputError(
			`Build Output Specification: invalid root config at ${configPath}.\n${result.error.message}`
		);
	}

	return result.data;
}

function parseJson(contents: string, configPath: string): unknown {
	try {
		return JSON.parse(contents);
	} catch (e) {
		const reason = e instanceof Error ? e.message : String(e);
		throw new BuildOutputError(
			`Build Output Specification: could not parse JSON at ${configPath}.\n${reason}`
		);
	}
}
