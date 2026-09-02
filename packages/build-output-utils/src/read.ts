import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { OutputSettingsSchema, OutputWorkerSchema } from "@cloudflare/config";
import { BuildOutputError } from "./errors";
import {
	BUILD_OUTPUT_VERSION,
	DEFAULT_WORKER_DIRECTORY_NAME,
	getSettingsConfigPath,
	getWorkerAssetsDir,
	getWorkerBundleDir,
	getWorkerConfigPath,
	getWorkersDir,
} from "./paths";
import type {
	ModuleType,
	ParsedOutputSettingsConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";

type ManifestModules = NonNullable<
	ParsedOutputWorkerConfig["manifest"]
>["modules"];

type CompleteManifest = Omit<
	NonNullable<ParsedOutputWorkerConfig["manifest"]>,
	"type"
> & { type: "complete" };

/** A schema-validated Worker config whose manifest has been fully resolved. */
export type ResolvedOutputWorkerConfig = Omit<
	ParsedOutputWorkerConfig,
	"manifest"
> & {
	manifest?: CompleteManifest;
};

interface BuildOutputWorkerBase {
	/** Absolute path to the Worker's `config.json`. */
	configPath: string;
	/** The parsed Worker config, including its fully resolved `manifest`. */
	config: ResolvedOutputWorkerConfig;
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

export type BuildOutputWorkers = Record<string, BuildOutputWorker> & {
	/** The Worker in the default directory. */
	default: BuildOutputWorker;
};

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
	 * The Workers found under `<root>/.cloudflare/output/v0/workers/`, keyed by
	 * their directory names. Guaranteed to contain the `default` Worker.
	 */
	workers: BuildOutputWorkers;
}

/**
 * Read and validate the Build Output Specification tree at
 * `<root>/.cloudflare/output/v0/`.
 *
 * Reads the optional top-level settings `config.json`, then reads and
 * schema-validates the Worker's `config.json` and resolves its
 * `bundle/` / `assets/` directories. Partial manifests are resolved into
 * complete manifests using the files in `bundle/`.
 *
 * @throws {BuildOutputError} if the top-level `config.json` is invalid, or if
 * the Worker config is missing, is not valid JSON, or fails schema validation.
 */
export async function readBuildOutput(root: string): Promise<BuildOutput> {
	const settings = await readSettings(root);
	const defaultWorker = await readWorker(root, DEFAULT_WORKER_DIRECTORY_NAME);
	const additionalWorkerDirectoryNames = (
		await fsp.readdir(getWorkersDir(root), {
			withFileTypes: true,
		})
	)
		.filter(
			(entry) =>
				entry.isDirectory() && entry.name !== DEFAULT_WORKER_DIRECTORY_NAME
		)
		.map((entry) => entry.name)
		.sort();
	const additionalWorkers = await Promise.all(
		additionalWorkerDirectoryNames.map(
			async (workerDirectoryName) =>
				[
					workerDirectoryName,
					await readWorker(root, workerDirectoryName),
				] as const
		)
	);
	const workers: BuildOutputWorkers = {
		default: defaultWorker,
		...Object.fromEntries(additionalWorkers),
	};

	return { root, version: BUILD_OUTPUT_VERSION, settings, workers };
}

/**
 * Read and schema-validate the Worker's `config.json` and resolve its
 * `bundle/` / `assets/` directories.
 *
 * @returns the Worker, with whichever of its directories exist resolved.
 * @throws {BuildOutputError} if the config is missing, is not valid JSON, or
 * fails schema validation.
 */
async function readWorker(
	root: string,
	workerDirectoryName: string
): Promise<BuildOutputWorker> {
	const configPath = getWorkerConfigPath(root, workerDirectoryName);

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

	const bundleDir = getWorkerBundleDir(root, workerDirectoryName);
	const assetsDir = getWorkerAssetsDir(root, workerDirectoryName);
	const hasBundleDir = fs.existsSync(bundleDir);
	const hasAssetsDir = fs.existsSync(assetsDir);

	if (result.data.manifest && !hasBundleDir) {
		throw new BuildOutputError(
			`Worker config at ${configPath} contains a manifest, but no bundle directory exists at ${bundleDir}.`
		);
	}

	if (hasBundleDir) {
		const config = await resolveManifest(result.data, configPath, bundleDir);
		return {
			configPath,
			config,
			bundleDir,
			assetsDir: hasAssetsDir ? assetsDir : undefined,
		};
	}

	if (hasAssetsDir) {
		const { manifest: _manifest, ...config } = result.data;
		return {
			configPath,
			config,
			bundleDir: undefined,
			assetsDir,
		};
	}

	throw new BuildOutputError(
		`Worker config at ${configPath} has neither a bundle directory (${bundleDir}) nor an assets directory (${assetsDir}).`
	);
}

/** Resolve the manifest against the bundle contents. */
async function resolveManifest(
	config: ParsedOutputWorkerConfig,
	configPath: string,
	bundleDir: string
): Promise<ResolvedOutputWorkerConfig> {
	const { manifest, ...workerConfig } = config;
	if (manifest === undefined) {
		return workerConfig;
	}
	if (manifest.type === "complete") {
		return {
			...workerConfig,
			manifest: { ...manifest, type: "complete" },
		};
	}

	const inferredModules = await scanModules(bundleDir);
	if (inferredModules[manifest.mainModule]?.type !== "esm") {
		throw new BuildOutputError(
			`partial manifest at ${configPath} has main module "${manifest.mainModule}", but it was not found as an ES module in the bundle.`
		);
	}

	const modules = {
		...inferredModules,
		...manifest.modules,
	};

	return {
		...workerConfig,
		manifest: {
			type: "complete",
			mainModule: manifest.mainModule,
			modules,
		},
	};
}

/** Infer JavaScript modules and source maps from a bundle directory. */
async function scanModules(bundleDir: string): Promise<ManifestModules> {
	const modules: ManifestModules = {};
	const entries = await fsp.readdir(bundleDir, {
		recursive: true,
		withFileTypes: true,
	});

	for (const entry of entries) {
		const type = entry.isFile() ? inferModuleType(entry.name) : undefined;
		if (type !== undefined) {
			const modulePath = path
				.relative(bundleDir, path.join(entry.parentPath, entry.name))
				.split(path.sep)
				.join("/");
			modules[modulePath] = { type };
		}
	}

	return modules;
}

/** Infer the module type for extensions supported by partial manifests. */
function inferModuleType(modulePath: string): ModuleType | undefined {
	switch (path.extname(modulePath)) {
		case ".js":
		case ".mjs":
			return "esm";
		case ".map":
			return "sourcemap";
	}
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
