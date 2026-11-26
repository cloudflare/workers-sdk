import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import {
	BuildOutputContainerConfigSchema,
	BuildOutputProducerSchema,
	BuildOutputRootConfigSchema,
	BuildOutputWorkerConfigSchema,
} from "@cloudflare/config";
import { BuildOutputError } from "./errors";
import {
	BUILD_OUTPUT_VERSION,
	DEFAULT_WORKER_DIRECTORY_NAME,
	getBuildOutputDir,
	getContainerConfigPath,
	getContainersDir,
	getRootConfigPath,
	getWorkerAssetsDir,
	getWorkerBundleDir,
	getWorkerConfigPath,
	getWorkerDir,
	getWorkersDir,
} from "./paths";
import type { BuildOutputUnknownField } from "./errors";
import type {
	ModuleType,
	ParsedBuildOutputContainerConfig,
	ParsedBuildOutputProducer,
	ParsedBuildOutputRootConfig,
	ParsedBuildOutputWorkerConfig,
} from "@cloudflare/config";

/** Matches version directory names such as `v0`, `v1` and `v12`. */
const VERSION_DIRECTORY_PATTERN = /^v(0|[1-9]\d*)$/;

/** The parts of a schema validation issue needed to report unknown fields. */
interface ValidationIssue {
	code: string;
	path: PropertyKey[];
	keys?: string[];
}

/** The parts of a failed schema validation needed to report it. */
interface ValidationFailure {
	message: string;
	issues: readonly ValidationIssue[];
}

type ManifestModules = NonNullable<
	ParsedBuildOutputWorkerConfig["manifest"]
>["modules"];

type CompleteManifest = Omit<
	NonNullable<ParsedBuildOutputWorkerConfig["manifest"]>,
	"type"
> & { type: "complete" };

/** A parsed Worker config whose manifest has been fully resolved. */
export type ResolvedOutputWorkerConfig = Omit<
	ParsedBuildOutputWorkerConfig,
	"manifest"
> & {
	manifest?: CompleteManifest;
};

interface BuildOutputWorkerBase {
	/** Absolute path to the Worker's `worker.config.json`. */
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
	/** The default Worker. */
	default: BuildOutputWorker;
};

/** A Container found in the Build Output Specification tree. */
export interface BuildOutputContainer {
	/** Absolute path to the Container's `container.config.json`. */
	configPath: string;
	/** The parsed Container config. */
	config: ParsedBuildOutputContainerConfig;
}

/** Containers found in the Build Output Specification tree. */
export type BuildOutputContainers = BuildOutputContainer[];

/**
 * The result of reading a Build Output Specification tree.
 */
export interface BuildOutput {
	/** Absolute project root from which the output was read. */
	root: string;
	/** The version directory that was read, such as `"v1"`. */
	version: string;
	/**
	 * The parsed root `config.json`.
	 */
	rootConfig: ParsedBuildOutputRootConfig;
	/**
	 * The deployable Workers found under
	 * `<root>/.cloudflare/output/v1/workers/`, keyed by their directory names.
	 * Worker configs without a `bundle/` or `assets/` directory are omitted.
	 * Guaranteed to contain the `default` Worker.
	 */
	workers: BuildOutputWorkers;
	/**
	 * The Containers found under
	 * `<root>/.cloudflare/output/v1/containers/`. Their order has no semantic
	 * meaning.
	 */
	containers: BuildOutputContainers;
}

/**
 * Read and parse the Build Output Specification tree at
 * `<root>/.cloudflare/output/v1/`.
 *
 * Lists the version directories under `<root>/.cloudflare/output/` first and
 * fails unless exactly one, `v1`, is present. Then reads the root
 * `config.json`, reads and parses each `worker.config.json` and
 * `container.config.json`, and resolves each Worker's `bundle/` / `assets/`
 * directories. Partial manifests are resolved into complete manifests using
 * the files in `bundle/`.
 *
 * @throws {BuildOutputError} with a `code` describing the failure: if no
 * version directory is found (`not-found`), if the only version directory is
 * newer or older than `v1` (`newer-version` / `older-version`), if more than
 * one version directory is found (`multiple-versions`), if a config contains
 * fields this reader doesn't support (`unknown-fields`), or if the tree is
 * otherwise malformed, such as a missing or invalid config or a symlink
 * (`invalid`).
 */
export async function readBuildOutput(root: string): Promise<BuildOutput> {
	const absoluteRoot = path.resolve(root);
	assertBuildOutputDirectoryNotLinked(absoluteRoot);
	const version = await detectVersion(absoluteRoot);
	await assertNoSymlinksInVersion(absoluteRoot, version);
	const rootConfig = await readRootConfig(absoluteRoot);
	const [workers, containers] = await Promise.all([
		readWorkers({ root: absoluteRoot, producer: rootConfig.producer }),
		readContainers({ root: absoluteRoot, producer: rootConfig.producer }),
	]);

	return {
		root: absoluteRoot,
		version,
		rootConfig,
		workers,
		containers,
	};
}

/**
 * Find the single version directory under `.cloudflare/output/` and check
 * that this reader supports it.
 *
 * Entries not named `v<N>` are ignored so that files such as `.DS_Store`
 * don't break deploys. More than one version directory is an error because a
 * stale tree next to a fresh one could otherwise deploy old code. A symlink
 * named `v<N>` counts as a version directory, so that it is rejected as a
 * symlink rather than reported as missing output.
 *
 * @returns the name of the version directory, such as `"v1"`.
 * @throws {BuildOutputError} if there isn't exactly one supported version
 * directory.
 */
async function detectVersion(root: string): Promise<string> {
	const buildOutputDir = getBuildOutputDir(root);
	const isDirectory =
		fs.statSync(buildOutputDir, { throwIfNoEntry: false })?.isDirectory() ??
		false;
	const foundVersions = isDirectory
		? (await fsp.readdir(buildOutputDir, { withFileTypes: true }))
				.filter(
					(entry) =>
						(entry.isDirectory() || entry.isSymbolicLink()) &&
						VERSION_DIRECTORY_PATTERN.test(entry.name)
				)
				.map((entry) => entry.name)
				.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
		: [];
	const details = { foundVersions, supportedVersions: [BUILD_OUTPUT_VERSION] };

	const [version, ...otherVersions] = foundVersions;
	if (version === undefined) {
		throw new BuildOutputError(`No Build Output found in ${buildOutputDir}.`, {
			code: "not-found",
			...details,
		});
	}
	if (otherVersions.length > 0) {
		throw new BuildOutputError(
			`Found Build Output in more than one format (${foundVersions.join(", ")}) in ${buildOutputDir}. Delete ${buildOutputDir} and rebuild.`,
			{ code: "multiple-versions", ...details }
		);
	}
	if (version === BUILD_OUTPUT_VERSION) {
		return version;
	}

	if (Number(version.slice(1)) > Number(BUILD_OUTPUT_VERSION.slice(1))) {
		throw new BuildOutputError(
			`This Build Output uses format ${version}, but this reader supports ${BUILD_OUTPUT_VERSION}. Upgrade the tool reading it.`,
			{ code: "newer-version", ...details }
		);
	}
	throw new BuildOutputError(
		`This Build Output uses the older ${version} format. It was written by an out-of-date build tool. Upgrade it and rebuild.`,
		{ code: "older-version", ...details }
	);
}

/**
 * Reject a linked `.cloudflare` or `.cloudflare/output` directory before
 * anything reads `.cloudflare/output`, so that reading never follows a link
 * out of the project.
 */
function assertBuildOutputDirectoryNotLinked(root: string): void {
	const buildOutputDir = getBuildOutputDir(root);
	for (const directory of [path.dirname(buildOutputDir), buildOutputDir]) {
		const entry = fs.lstatSync(directory, { throwIfNoEntry: false });
		if (entry === undefined) {
			return;
		}
		assertNotSymlink(directory, entry);
		if (!entry.isDirectory()) {
			return;
		}
	}
}

/**
 * Reject symlinks in the version directory being read, so the build output
 * remains portable and self-contained.
 *
 * Only that directory is scanned. Entries that aren't version directories are
 * ignored, and other versions aren't read, so their contents can't fail the
 * read.
 */
async function assertNoSymlinksInVersion(
	root: string,
	version: string
): Promise<void> {
	const versionDir = path.join(getBuildOutputDir(root), version);
	assertNotSymlink(versionDir, fs.lstatSync(versionDir));

	const entries = await fsp.readdir(versionDir, {
		recursive: true,
		withFileTypes: true,
	});
	for (const entry of entries) {
		assertNotSymlink(path.join(entry.parentPath, entry.name), entry);
	}
}

function assertNotSymlink(filePath: string, entry: fs.Stats | fs.Dirent): void {
	if (entry.isSymbolicLink()) {
		throw new BuildOutputError(
			`symlink found at ${filePath}. Symlinks are not permitted because the build output must be portable and self-contained.`
		);
	}
}

/** Where to read from, and who wrote it for error messages. */
interface ReadOptions {
	root: string;
	/** The tool that wrote the tree, attached to any error thrown. */
	producer?: ParsedBuildOutputProducer;
}

/** Options for reading one Worker or Container directory. */
interface ReadDirectoryOptions extends ReadOptions {
	directoryName: string;
}

/** Read and parse the default Worker and any additional Worker configs. */
async function readWorkers({
	root,
	producer,
}: ReadOptions): Promise<BuildOutputWorkers> {
	const workersDir = getWorkersDir(root);
	const defaultWorker = await readWorker({
		root,
		directoryName: DEFAULT_WORKER_DIRECTORY_NAME,
		producer,
	});
	if (defaultWorker === undefined) {
		const workerDir = getWorkerDir(root, DEFAULT_WORKER_DIRECTORY_NAME);
		const bundleDir = getWorkerBundleDir(root, DEFAULT_WORKER_DIRECTORY_NAME);
		const assetsDir = getWorkerAssetsDir(root, DEFAULT_WORKER_DIRECTORY_NAME);
		throw new BuildOutputError(
			`Default Worker at ${workerDir} has neither a bundle directory (${bundleDir}) nor an assets directory (${assetsDir}).`,
			{ producer }
		);
	}
	const additionalWorkerDirectoryNames = (
		await fsp.readdir(workersDir, { withFileTypes: true })
	)
		.filter(
			(entry) =>
				entry.isDirectory() && entry.name !== DEFAULT_WORKER_DIRECTORY_NAME
		)
		.map((entry) => entry.name);
	const additionalWorkers = await Promise.all(
		additionalWorkerDirectoryNames.map(async (workerDirectoryName) => {
			const worker = await readWorker({
				root,
				directoryName: workerDirectoryName,
				producer,
			});
			return worker === undefined
				? undefined
				: ([workerDirectoryName, worker] as const);
		})
	);

	return {
		default: defaultWorker,
		...Object.fromEntries(
			additionalWorkers.filter(
				(entry): entry is readonly [string, BuildOutputWorker] =>
					entry !== undefined
			)
		),
	};
}

/** Read and parse all Container configs, if any. */
async function readContainers({
	root,
	producer,
}: ReadOptions): Promise<BuildOutputContainers> {
	const containersDir = getContainersDir(root);
	if (!fs.existsSync(containersDir)) {
		return [];
	}

	const containerDirectoryNames = (
		await fsp.readdir(containersDir, { withFileTypes: true })
	)
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

	return Promise.all(
		containerDirectoryNames.map((containerDirectoryName) =>
			readContainer({ root, directoryName: containerDirectoryName, producer })
		)
	);
}

/** Read and parse one Container config. */
async function readContainer({
	root,
	directoryName,
	producer,
}: ReadDirectoryOptions): Promise<BuildOutputContainer> {
	const configPath = getContainerConfigPath(root, directoryName);

	if (!fs.existsSync(configPath)) {
		throw new BuildOutputError(`no Container config found at ${configPath}.`, {
			producer,
		});
	}

	const contents = await fsp.readFile(configPath, "utf-8");
	const result = BuildOutputContainerConfigSchema.safeParse(
		parseJson({ contents, configPath, producer })
	);
	if (!result.success) {
		throw createValidationError({
			description: "Container config",
			root,
			configPath,
			failure: result.error,
			producer,
		});
	}

	return { configPath, config: result.data };
}

/**
 * Read and parse the Worker's `worker.config.json` and resolve its
 * `bundle/` / `assets/` directories.
 *
 * @returns the Worker, with whichever of its directories exist resolved, or
 * `undefined` when it has no deployable output.
 * @throws {BuildOutputError} if the config is missing, is not valid JSON, or
 * does not match its schema.
 */
async function readWorker({
	root,
	directoryName,
	producer,
}: ReadDirectoryOptions): Promise<BuildOutputWorker | undefined> {
	const configPath = getWorkerConfigPath(root, directoryName);

	if (!fs.existsSync(configPath)) {
		throw new BuildOutputError(`no Worker config found at ${configPath}.`, {
			producer,
		});
	}

	const contents = await fsp.readFile(configPath, "utf-8");
	const result = BuildOutputWorkerConfigSchema.safeParse(
		parseJson({ contents, configPath, producer })
	);
	if (!result.success) {
		throw createValidationError({
			description: "Worker config",
			root,
			configPath,
			failure: result.error,
			producer,
		});
	}

	const bundleDir = getWorkerBundleDir(root, directoryName);
	const assetsDir = getWorkerAssetsDir(root, directoryName);
	const hasBundleDir = fs.existsSync(bundleDir);
	const hasAssetsDir = fs.existsSync(assetsDir);

	if (hasBundleDir) {
		const config = await resolveManifest({
			config: result.data,
			configPath,
			bundleDir,
			producer,
		});
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

	return undefined;
}

/** Resolve the manifest against the bundle contents. */
async function resolveManifest({
	config,
	configPath,
	bundleDir,
	producer,
}: {
	config: ParsedBuildOutputWorkerConfig;
	configPath: string;
	bundleDir: string;
	producer?: ParsedBuildOutputProducer;
}): Promise<ResolvedOutputWorkerConfig> {
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
			`partial manifest at ${configPath} has main module "${manifest.mainModule}", but it was not found as an ES module in the bundle.`,
			{ producer }
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
 * Read and parse the root `config.json`.
 *
 * @returns the parsed root config.
 * @throws {BuildOutputError} if the file is missing, is not valid JSON, or
 * does not match its schema.
 */
async function readRootConfig(
	root: string
): Promise<ParsedBuildOutputRootConfig> {
	const configPath = getRootConfigPath(root);

	if (!fs.existsSync(configPath)) {
		throw new BuildOutputError(`no root config found at ${configPath}.`);
	}

	const contents = await fsp.readFile(configPath, "utf-8");
	const rawConfig = parseJson({ contents, configPath });
	const result = BuildOutputRootConfigSchema.safeParse(rawConfig);
	if (!result.success) {
		throw createValidationError({
			description: "root config",
			root,
			configPath,
			failure: result.error,
			producer: readProducer(rawConfig),
		});
	}

	return result.data;
}

/**
 * Read `producer` from a root config that failed validation, so that errors
 * can still name the tool that wrote it.
 */
function readProducer(
	rawConfig: unknown
): ParsedBuildOutputProducer | undefined {
	if (typeof rawConfig !== "object" || rawConfig === null) {
		return undefined;
	}
	const result = BuildOutputProducerSchema.safeParse(
		"producer" in rawConfig ? rawConfig.producer : undefined
	);
	return result.success ? result.data : undefined;
}

/**
 * Convert a failed schema validation into a {@link BuildOutputError}.
 *
 * When every issue is an unknown key, the error lists each field and has the
 * `unknown-fields` code: the output was most likely written by a newer build
 * tool. Otherwise the error has the `invalid` code and includes the full
 * validation message.
 */
function createValidationError({
	description,
	root,
	configPath,
	failure,
	producer,
}: {
	description: string;
	root: string;
	configPath: string;
	failure: ValidationFailure;
	producer?: ParsedBuildOutputProducer;
}): BuildOutputError {
	const isUnknownFieldsOnly =
		failure.issues.length > 0 &&
		failure.issues.every((issue) => issue.code === "unrecognized_keys");
	if (!isUnknownFieldsOnly) {
		return new BuildOutputError(
			`invalid ${description} at ${configPath}.\n${failure.message}`,
			{ producer }
		);
	}

	const file = path
		.relative(getBuildOutputDir(root), configPath)
		.split(path.sep)
		.join("/");
	const unknownFields: BuildOutputUnknownField[] = failure.issues.flatMap(
		(issue) =>
			(issue.keys ?? []).map((key) => ({
				file,
				path: [...issue.path.map(String), key].join("."),
			}))
	);
	const writtenBy =
		producer === undefined
			? "a newer build tool"
			: `${producer.name} ${producer.version}`;

	return new BuildOutputError(
		[
			`${file} contains fields this reader doesn't support:`,
			...unknownFields.map((field) => `  - ${field.path}`),
			`The output was written by ${writtenBy}. Upgrade the tool reading it.`,
		].join("\n"),
		{ code: "unknown-fields", producer, unknownFields }
	);
}

function parseJson({
	contents,
	configPath,
	producer,
}: {
	contents: string;
	configPath: string;
	producer?: ParsedBuildOutputProducer;
}): unknown {
	try {
		return JSON.parse(contents);
	} catch (e) {
		const reason = e instanceof Error ? e.message : String(e);
		throw new BuildOutputError(
			`could not parse JSON at ${configPath}.\n${reason}`,
			{ producer }
		);
	}
}
