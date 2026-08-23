import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import { OutputSettingsSchema, OutputWorkerSchema } from "@cloudflare/config";
import { BuildOutputError } from "./errors";
import {
	BUILD_OUTPUT_VERSION,
	getSettingsConfigPath,
	getWorkerAssetsDir,
	getWorkerBundleDir,
	getWorkerConfigPath,
} from "./paths";
import type {
	ParsedOutputSettingsConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";

interface BuildOutputWorkerBase {
	/** Absolute path to the Worker's `config.json`. */
	configPath: string;
	/** The parsed, schema-validated Worker config, including its `manifest`. */
	config: ParsedOutputWorkerConfig;
}

/**
 * The Worker found in the Build Output Specification tree.
 *
 * `bundleDir` / `assetsDir` are resolved to `undefined` when the corresponding
 * directory is absent on disk, so consumers don't need their own existence
 * checks. A Worker always has at least one of them: the type is a union so
 * that a Worker with neither a `bundle/` nor an `assets/` directory is
 * unrepresentable.
 */
export type BuildOutputWorker = BuildOutputWorkerBase &
	(
		| {
				/** Absolute path to the Worker's `bundle/` directory. */
				bundleDir: string;
				/** Absolute path to the Worker's `assets/` directory, if present. */
				assetsDir: string | undefined;
		  }
		| {
				/** Absolute path to the Worker's `bundle/` directory, if present. */
				bundleDir: string | undefined;
				/** Absolute path to the Worker's `assets/` directory. */
				assetsDir: string;
		  }
	);

/**
 * The result of reading a Build Output Specification tree.
 */
export interface BuildOutput {
	/** Project root the output was read from. */
	root: string;
	/** Version of the spec the tree conforms to. */
	version: string;
	/**
	 * The parsed, schema-validated project-level settings shared by every
	 * Worker, including the `mode` the build was produced in. Current writers
	 * always emit the top-level `config.json`; `undefined` is retained for
	 * compatibility with third-party build output.
	 */
	settings: ParsedOutputSettingsConfig | undefined;
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
 * Reads the optional top-level settings `config.json`, then reads and
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
 * @returns the Worker, with whichever of its directories exist resolved.
 * @throws {BuildOutputError} if the config is missing, is not valid JSON, or
 * fails schema validation.
 */
async function readWorker(root: string): Promise<BuildOutputWorker> {
	const configPath = getWorkerConfigPath(root);

	if (!fs.existsSync(configPath)) {
		throw new BuildOutputError(`no Worker config found at ${configPath}.`);
	}

	const contents = await fsp.readFile(configPath, "utf-8");
	const result = OutputWorkerSchema.safeParse(parseJson(contents, configPath));
	if (!result.success) {
		throw new BuildOutputError(
			`invalid Worker config at ${configPath}.\n${result.error.message}`
		);
	}

	const bundleDir = getWorkerBundleDir(root);
	const assetsDir = getWorkerAssetsDir(root);
	const hasBundleDir = fs.existsSync(bundleDir);
	const hasAssetsDir = fs.existsSync(assetsDir);

	if (result.data.manifest && !hasBundleDir) {
		throw new BuildOutputError(
			`Worker config at ${configPath} contains a manifest, but no bundle directory exists at ${bundleDir}.`
		);
	}

	if (hasBundleDir) {
		return {
			configPath,
			config: result.data,
			bundleDir,
			assetsDir: hasAssetsDir ? assetsDir : undefined,
		};
	}

	if (hasAssetsDir) {
		return {
			configPath,
			config: result.data,
			bundleDir: undefined,
			assetsDir,
		};
	}

	throw new BuildOutputError(
		`Worker config at ${configPath} has neither a bundle directory (${bundleDir}) nor an assets directory (${assetsDir}).`
	);
}

/**
 * Read and schema-validate the optional top-level `config.json` holding the
 * project-level settings shared by every Worker, including the mode the build
 * was produced in.
 *
 * Returned whole: consumers that need only the settings the user declared
 * narrow it themselves.
 *
 * @returns the parsed settings, or `undefined` when the file is absent.
 * @throws {BuildOutputError} if the file is not valid JSON or fails schema
 * validation.
 */
async function readSettings(
	root: string
): Promise<ParsedOutputSettingsConfig | undefined> {
	const configPath = getSettingsConfigPath(root);

	if (!fs.existsSync(configPath)) {
		return undefined;
	}

	const contents = await fsp.readFile(configPath, "utf-8");
	const result = OutputSettingsSchema.safeParse(
		parseJson(contents, configPath)
	);
	if (!result.success) {
		throw new BuildOutputError(
			`invalid settings config at ${configPath}.\n${result.error.message}`
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
			`could not parse JSON at ${configPath}.\n${reason}`
		);
	}
}
