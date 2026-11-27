import path from "node:path";
import {
	CONFIGURATION_DOCS_URL,
	ENVIRONMENTS_DOCS_URL,
	PREVIEWS_DOCS_URL,
	SECRETS_DOCS_URL,
	SOURCE_MAPS_DOCS_URL,
	createFollowUp,
	deduplicateFollowUps,
	followUpToComment,
} from "../follow-ups";
import {
	addProperty,
	camelObject,
	getRecord,
	hasOwn,
	isRecord,
	optionsFromRecord,
	toOutputValue,
	type UnknownRecord,
} from "./helpers";
import { convertRootConfig } from "./worker";
import type {
	ConvertedBranch,
	ConvertedWranglerBuild,
	ConvertedWranglerConfig,
	ConvertedWranglerSettings,
	MigrationBundler,
	MigrationFollowUp,
	OutputObject,
	OutputProperty,
} from "./types";
import type { RawConfig } from "@cloudflare/workers-utils/config";

const VITE_DEFAULT_MODES = new Set(["development", "production"]);

const NON_INHERITABLE_FIELDS = new Set<string>([
	"agent_memory",
	"ai_search_namespaces",
	"ai_search",
	"ai",
	"analytics",
	"analytics_engine_datasets",
	"artifacts",
	"browser",
	"cloudchamber",
	"connect",
	"containers",
	"d1_databases",
	"define",
	"dispatch_namespaces",
	"durable_objects",
	"flagship",
	"hyperdrive",
	"images",
	"k2",
	"kv_namespaces",
	"media",
	"mtls_certificates",
	"oidc_tokens",
	"pipelines",
	"queues",
	"r2_buckets",
	"ratelimits",
	"realtimekit",
	"secrets_store_secrets",
	"secrets",
	"send_email",
	"services",
	"stream",
	"streaming_tail_consumers",
	"tail_consumers",
	"unsafe_hello_world",
	"unsafe",
	"vars",
	"vectorize",
	"version_metadata",
	"vpc_networks",
	"vpc_services",
	"worker_loaders",
	"workflows",
] satisfies (keyof RawConfig)[]);

const TOOLING_FIELDS = new Set<string>([
	"alias",
	"base_dir",
	"build",
	"data_blobs",
	"define",
	"dev",
	"find_additional_modules",
	"jsx_factory",
	"jsx_fragment",
	"keep_names",
	"minify",
	"no_bundle",
	"preserve_file_names",
	"python_modules",
	"rules",
	"send_metrics",
	"text_blobs",
	"tsconfig",
	"wasm_modules",
] satisfies (keyof RawConfig)[]);

const TOP_LEVEL_ONLY_TOOLING_FIELDS = new Set<string>([
	"alias",
	"data_blobs",
	"dev",
	"send_metrics",
	"text_blobs",
	"wasm_modules",
] satisfies (keyof RawConfig)[]);

export const KNOWN_FIELDS = new Set<string>([
	"$schema",
	"access",
	"account_id",
	"addresses",
	"agent_memory",
	"ai_search_namespaces",
	"ai_search",
	"ai",
	"alias",
	"analytics",
	"analytics_engine_datasets",
	"artifacts",
	"assets",
	"base_dir",
	"browser",
	"build",
	"cache",
	"cloudchamber",
	"compatibility_date",
	"compatibility_flags",
	"compliance_region",
	"connect",
	"containers",
	"d1_databases",
	"data_blobs",
	"define",
	"dependencies_instrumentation",
	"dev",
	"dispatch_namespaces",
	"durable_objects",
	"env",
	"exports",
	"find_additional_modules",
	"first_party_worker",
	"flagship",
	"hyperdrive",
	"images",
	"jsx_factory",
	"jsx_fragment",
	"keep_names",
	"keep_vars",
	"k2",
	"kv_namespaces",
	"limits",
	"logfwdr",
	"logpush",
	"main",
	"media",
	"migrations",
	"minify",
	"mtls_certificates",
	"name",
	"no_bundle",
	"observability",
	"oidc_tokens",
	"pages_build_output_dir",
	"pipelines",
	"placement",
	"preserve_file_names",
	"preview_urls",
	"previews",
	"python_modules",
	"queues",
	"r2_buckets",
	"ratelimits",
	"realtimekit",
	"route",
	"routes",
	"rules",
	"secrets_store_secrets",
	"secrets",
	"send_email",
	"send_metrics",
	"services",
	"site",
	"stream",
	"streaming_tail_consumers",
	"tail_consumers",
	"text_blobs",
	"triggers",
	"tsconfig",
	"unsafe_hello_world",
	"unsafe",
	"upload_source_maps",
	"vars",
	"vectorize",
	"version_metadata",
	"vpc_networks",
	"vpc_services",
	"wasm_modules",
	"worker_loaders",
	"workers_dev",
	"workflows",
] satisfies (keyof RawConfig)[]);

function createBranchSource(
	base: UnknownRecord,
	overrides: UnknownRecord,
	environmentName?: string
): UnknownRecord {
	const merged: UnknownRecord = { ...base };
	delete merged.env;

	if (environmentName !== undefined) {
		for (const field of NON_INHERITABLE_FIELDS) {
			delete merged[field];
		}
	}

	Object.assign(merged, overrides);

	if (
		environmentName !== undefined &&
		typeof overrides.name !== "string" &&
		typeof base.name === "string"
	) {
		merged.name = `${base.name}-${environmentName}`;
	}

	return merged;
}

function createPreviewSource(
	base: UnknownRecord,
	overrides: UnknownRecord
): UnknownRecord {
	const merged = createBranchSource(base, {});

	for (const field of NON_INHERITABLE_FIELDS) {
		delete merged[field];
	}
	delete merged.logfwdr;

	Object.assign(merged, overrides);
	delete merged.previews;

	return merged;
}

function createToolingEnvironmentSource(
	base: UnknownRecord,
	overrides: UnknownRecord,
	environmentName: string
): UnknownRecord {
	const environmentOverrides = { ...overrides };
	for (const field of TOP_LEVEL_ONLY_TOOLING_FIELDS) {
		delete environmentOverrides[field];
	}

	return createBranchSource(base, environmentOverrides, environmentName);
}

function addUnknownFieldFollowUps(
	record: UnknownRecord,
	sourcePrefix: string,
	followUps: MigrationFollowUp[]
): void {
	for (const field of Object.keys(record)) {
		if (KNOWN_FIELDS.has(field)) {
			continue;
		}

		followUps.push(
			createFollowUp(
				"unsupported-field",
				`The Wrangler field \`${field}\` is not supported by the new config and was not migrated.`,
				{
					docsUrl: CONFIGURATION_DOCS_URL,
					sourcePath: sourcePrefix ? `${sourcePrefix}.${field}` : field,
				}
			)
		);
	}
}

function convertToolingObject(source: UnknownRecord): OutputObject {
	const properties: OutputProperty[] = [];
	const mappings: Array<[string, string]> = [
		["alias", "alias"],
		["base_dir", "baseDir"],
		["data_blobs", "dataBlobs"],
		["define", "define"],
		["find_additional_modules", "findAdditionalModules"],
		["jsx_factory", "jsxFactory"],
		["jsx_fragment", "jsxFragment"],
		["keep_names", "keepNames"],
		["minify", "minify"],
		["no_bundle", "noBundle"],
		["preserve_file_names", "preserveFileNames"],
		["python_modules", "pythonModules"],
		["rules", "rules"],
		["send_metrics", "sendMetrics"],
		["text_blobs", "textBlobs"],
		["tsconfig", "tsconfig"],
		["upload_source_maps", "uploadSourceMaps"],
		["wasm_modules", "wasmModules"],
	];
	for (const [sourceKey, targetKey] of mappings) {
		addProperty(properties, source, sourceKey, targetKey, (sourceValue) =>
			sourceKey === "python_modules" && isRecord(sourceValue)
				? camelObject(sourceValue)
				: toOutputValue(sourceValue)
		);
	}

	const build = getRecord(source, "build");
	if (build) {
		properties.push({ key: "build", value: camelObject(build) });
	}

	const dev = getRecord(source, "dev");
	if (dev) {
		const devOptions = optionsFromRecord(dev, [
			["enable_containers", "enableContainers"],
			["host", "host"],
			["inspector_ip", "inspectorIp"],
			["inspector_port", "inspectorPort"],
			["ip", "ip"],
			["local_protocol", "localProtocol"],
			["port", "port"],
			["upstream_protocol", "upstreamProtocol"],
		]);
		if (typeof dev.container_engine === "string") {
			devOptions.properties.push({
				key: "containerEngine",
				value: dev.container_engine,
			});
		}
		if (devOptions.properties.length > 0) {
			properties.push({ key: "dev", value: devOptions });
		}
	}
	if (dev?.generate_types === false) {
		properties.push({
			key: "types",
			value: {
				kind: "object",
				properties: [{ key: "generate", value: false }],
			},
		});
	}

	const assets = getRecord(source, "assets");
	if (assets && typeof assets.directory === "string") {
		properties.push({ key: "assetsDirectory", value: assets.directory });
	}

	return { kind: "object", properties };
}

function addViteToolingFollowUp(
	source: UnknownRecord,
	location: string,
	sourcePrefix: string,
	followUps: MigrationFollowUp[]
): void {
	const toolingFields = [...TOOLING_FIELDS].filter((field) =>
		hasOwn(source, field)
	);

	if (toolingFields.length > 0) {
		followUps.push(
			createFollowUp(
				"vite-tooling-config",
				`Wrangler-specific tooling fields${location ? ` in ${location}` : ""} were not migrated because the Vite bundler is selected: ${toolingFields.join(", ")}.`,
				{
					sourcePath: sourcePrefix
						? `${sourcePrefix}.${toolingFields.join(",")}`
						: toolingFields.join(","),
				}
			)
		);
	}

	if (typeof source.upload_source_maps === "boolean") {
		const setting = `Wrangler \`upload_source_maps: ${source.upload_source_maps}\`${location ? ` in ${location}` : ""} was not migrated because the Vite bundler is selected.`;
		followUps.push(
			createFollowUp(
				"vite-source-maps",
				source.upload_source_maps
					? `${setting} To keep uploading Worker source maps, enable \`build.sourcemap\` for the Worker's Vite environment. \`cf deploy\` uploads source maps included in the build output.`
					: `${setting} \`cf deploy\` uploads every Worker source map included in the build output, so keep \`build.sourcemap\` disabled for the Worker's Vite environment to avoid uploading source maps.`,
				{
					blocking: false,
					docsUrl: SOURCE_MAPS_DOCS_URL,
					sourcePath: sourcePrefix
						? `${sourcePrefix}.upload_source_maps`
						: "upload_source_maps",
				}
			)
		);
	}
}

function normalizeDirectory(directory: string): string {
	return path.posix
		.normalize(directory.replaceAll("\\", "/"))
		.replace(/(.)\/+$/, "$1");
}

/**
 * Checks whether the Vite build deploys a Wrangler assets directory's files at the same URLs,
 * going by default folder names: it's Vite's default public folder, which Vite copies into its
 * build, or the framework's default build output folder. A folder inside the build output would
 * move its files under a prefix.
 *
 * @param directory The Wrangler assets directory
 * @param outputDir The framework's default build output folder, if known
 * @returns Whether the Vite build deploys the directory's files
 */
function isDeployedByVite(directory: string, outputDir?: string): boolean {
	const normalizedDirectory = normalizeDirectory(directory);
	if (normalizedDirectory === "public") {
		return true;
	}
	if (outputDir === undefined) {
		return false;
	}

	return normalizedDirectory === normalizeDirectory(outputDir);
}

/**
 * Reports a Wrangler assets directory whose files the Vite build won't deploy.
 *
 * @param source The branch's settings
 * @param sourcePrefix Where the branch is in the Wrangler config
 * @param followUps The follow-ups to add to
 * @param outputDir The framework's default build output folder, if known
 */
function addViteAssetsDirectoryFollowUp(
	source: UnknownRecord,
	sourcePrefix: string,
	followUps: MigrationFollowUp[],
	outputDir: string | undefined
): void {
	const directory = getRecord(source, "assets")?.directory;
	if (typeof directory !== "string" || isDeployedByVite(directory, outputDir)) {
		return;
	}

	followUps.push(
		createFollowUp(
			"vite-assets-directory",
			`Vite doesn't deploy the files in the Wrangler assets directory \`${directory}\`. Move them into Vite's public folder (\`public\` by default), or point Vite's \`publicDir\` at it.`,
			{
				docsUrl: CONFIGURATION_DOCS_URL,
				sourcePath: `${sourcePrefix ? `${sourcePrefix}.` : ""}assets.directory`,
			}
		)
	);
}

/**
 * Reports a branch's assets directory, and its previews', for a Vite build.
 *
 * @param source The branch's settings
 * @param sourcePrefix Where the branch is in the Wrangler config
 * @param followUps The follow-ups to add to
 */
function addViteBranchFollowUps(
	source: UnknownRecord,
	sourcePrefix: string,
	followUps: MigrationFollowUp[],
	outputDir: string | undefined
): void {
	addViteAssetsDirectoryFollowUp(source, sourcePrefix, followUps, outputDir);
	const previews = getRecord(source, "previews");
	if (previews) {
		addViteAssetsDirectoryFollowUp(
			createPreviewSource(source, previews),
			`${sourcePrefix ? `${sourcePrefix}.` : ""}previews`,
			followUps,
			outputDir
		);
	}
}

function convertBranch(
	source: UnknownRecord,
	sourcePrefix: string,
	imports: Set<string>,
	followUps: MigrationFollowUp[]
): ConvertedBranch {
	const config = convertRootConfig(source, sourcePrefix, imports, followUps);

	const previews = getRecord(source, "previews");
	if (!previews) {
		return {
			config,
		};
	}

	const previewPath = `${sourcePrefix ? `${sourcePrefix}.` : ""}previews`;
	const followUp = createFollowUp(
		"preview-review",
		"Preview configuration was converted to `ctx.isPreview` handling. Review the generated Preview branch.",
		{ docsUrl: PREVIEWS_DOCS_URL, sourcePath: previewPath }
	);
	followUps.push(followUp);

	const worker = config.properties.find(({ key }) => key === "worker")?.value;
	if (
		worker &&
		!Array.isArray(worker) &&
		typeof worker === "object" &&
		worker.kind === "object"
	) {
		worker.trailingComments = [
			...(worker.trailingComments ?? []),
			followUpToComment(followUp),
		];
	}

	const previewSource = createPreviewSource(source, previews);

	return {
		config,
		previewConfig: convertRootConfig(
			previewSource,
			previewPath,
			imports,
			followUps
		),
	};
}

function convertToolingBranch(
	source: UnknownRecord
): ConvertedBranch | undefined {
	const config = convertToolingObject(source);
	const previews = getRecord(source, "previews");
	const previewConfig = previews
		? convertToolingObject(createPreviewSource(source, previews))
		: undefined;

	if (
		config.properties.length === 0 &&
		(previewConfig?.properties.length ?? 0) === 0
	) {
		return undefined;
	}

	return {
		config,
		previewConfig,
	};
}

/**
 * Converts a Wrangler config's Worker settings, for every branch: the top level, each environment
 * and their previews. Build settings are left to {@link convertWranglerBuild}, because they
 * depend on the bundler.
 *
 * @param rawConfig The parsed contents of a Wrangler JSON, JSONC, or TOML configuration.
 * @param secretFiles Secret-like files found next to it, which aren't read.
 *
 * @returns The converted settings, as trees of values and `cf/config` helper calls, with follow-ups.
 */
export function convertWranglerSettings(
	rawConfig: RawConfig,
	secretFiles: string[]
): ConvertedWranglerSettings {
	const source = rawConfig as UnknownRecord;
	const imports = new Set<string>();
	const followUps: MigrationFollowUp[] = [];
	addUnknownFieldFollowUps(source, "", followUps);
	const sourcePreviews = getRecord(source, "previews");
	if (sourcePreviews) {
		addUnknownFieldFollowUps(sourcePreviews, "previews", followUps);
	}

	const environments = getRecord(source, "env") ?? {};
	for (const [name, environment] of Object.entries(environments)) {
		if (isRecord(environment)) {
			addUnknownFieldFollowUps(environment, `env.${name}`, followUps);
			const environmentPreviews = getRecord(environment, "previews");
			if (environmentPreviews) {
				addUnknownFieldFollowUps(
					environmentPreviews,
					`env.${name}.previews`,
					followUps
				);
			}
			continue;
		}

		followUps.push(
			createFollowUp(
				"invalid-environment",
				`The Wrangler environment \`${name}\` is not an object and was not migrated.`,
				{ sourcePath: `env.${name}` }
			)
		);
	}

	if (secretFiles.length > 0) {
		followUps.push(
			createFollowUp(
				"secret-files-not-migrated",
				`Secret-like files were detected but not read or migrated: ${secretFiles.join(", ")}. Only \`secrets.required\` entries are migrated.`,
				{
					blocking: false,
					docsUrl: SECRETS_DOCS_URL,
				}
			)
		);
	}

	const baseSource = createBranchSource(source, {});
	const base = convertBranch(baseSource, "", imports, followUps);
	const convertedEnvironments = new Map<string, ConvertedBranch>();

	for (const [name, value] of Object.entries(environments)) {
		if (!isRecord(value)) {
			continue;
		}

		const environmentSource = createBranchSource(source, value, name);
		convertedEnvironments.set(
			name,
			convertBranch(environmentSource, `env.${name}`, imports, followUps)
		);
	}

	if (convertedEnvironments.size > 0) {
		followUps.push(
			createFollowUp(
				"environments-migrated",
				"Wrangler environments were migrated to a `switch (ctx.mode)` statement. Select one with the `--mode` flag.",
				{ blocking: false, docsUrl: ENVIRONMENTS_DOCS_URL, sourcePath: "env" }
			)
		);
	}

	return {
		base,
		environments: convertedEnvironments,
		followUps: deduplicateFollowUps(followUps),
		imports,
	};
}

/**
 * Converts a Wrangler config's build settings for a bundler. With Wrangler, they become the
 * branches of `wrangler.config.ts`. With Vite, which builds the Worker itself, they become
 * follow-ups for the settings that don't carry over.
 *
 * @param rawConfig The parsed contents of a Wrangler JSON, JSONC, or TOML configuration.
 * @param bundler The bundler the project builds with.
 * @param outputDir The framework's default build output folder, relative to the Wrangler config, if known.
 *
 * @returns The `wrangler.config.ts` branches, and follow-ups for the build settings left out.
 */
export function convertWranglerBuild(
	rawConfig: RawConfig,
	bundler: MigrationBundler,
	outputDir?: string
): ConvertedWranglerBuild {
	const source = rawConfig as UnknownRecord;
	const followUps: MigrationFollowUp[] = [];
	const environments = Object.entries(getRecord(source, "env") ?? {}).filter(
		(entry): entry is [string, UnknownRecord] => isRecord(entry[1])
	);
	const baseSource = createBranchSource(source, {});

	if (bundler === "vite") {
		for (const [name] of environments) {
			if (VITE_DEFAULT_MODES.has(name)) {
				followUps.push(
					createFollowUp(
						"vite-mode-environment-conflict",
						`The Wrangler environment \`${name}\` conflicts with Vite's default \`${name}\` mode. Rename or remap this environment before using the generated config so Vite does not select it implicitly.`,
						{
							docsUrl: ENVIRONMENTS_DOCS_URL,
							sourcePath: `env.${name}`,
						}
					)
				);
			}
		}

		addViteToolingFollowUp(source, "", "", followUps);
		const sourcePreviews = getRecord(source, "previews");
		if (sourcePreviews) {
			addViteToolingFollowUp(sourcePreviews, "previews", "previews", followUps);
		}
		for (const [name, environment] of environments) {
			addViteToolingFollowUp(
				environment,
				`environment \`${name}\``,
				`env.${name}`,
				followUps
			);
			const environmentPreviews = getRecord(environment, "previews");
			if (environmentPreviews) {
				addViteToolingFollowUp(
					environmentPreviews,
					`environment \`${name}\` previews`,
					`env.${name}.previews`,
					followUps
				);
			}
		}

		addViteBranchFollowUps(baseSource, "", followUps, outputDir);
		for (const [name, environment] of environments) {
			addViteBranchFollowUps(
				createBranchSource(source, environment, name),
				`env.${name}`,
				followUps,
				outputDir
			);
		}

		return {
			followUps: deduplicateFollowUps(followUps),
			toolingEnvironments: new Map(),
		};
	}

	const dev = getRecord(source, "dev");
	if (dev && isRecord(dev.container_engine)) {
		followUps.push(
			createFollowUp(
				"container-engine-config",
				"The structured Wrangler container engine setting is not supported by wrangler.config.ts and was not migrated.",
				{ sourcePath: "dev.container_engine" }
			)
		);
	}

	const toolingBase = convertToolingBranch(baseSource);
	const toolingEnvironments = new Map<string, ConvertedBranch>();
	for (const [name, environment] of environments) {
		const tooling = convertToolingBranch(
			createToolingEnvironmentSource(source, environment, name)
		);
		if (tooling || toolingBase) {
			toolingEnvironments.set(
				name,
				tooling ?? { config: { kind: "object", properties: [] } }
			);
		}
	}

	return {
		followUps: deduplicateFollowUps(followUps),
		toolingBase,
		toolingEnvironments,
	};
}

/**
 * Converts a Wrangler config's Worker settings and its build settings for a bundler.
 *
 * @param rawConfig The parsed contents of a Wrangler JSON, JSONC, or TOML configuration.
 * @param bundler The bundler the project builds with.
 * @param secretFiles Secret-like files found next to it, which aren't read.
 *
 * @returns Both halves, with their follow-ups together.
 */
export function convertWranglerConfig(
	rawConfig: RawConfig,
	bundler: MigrationBundler,
	secretFiles: string[]
): ConvertedWranglerConfig {
	const settings = convertWranglerSettings(rawConfig, secretFiles);
	const build = convertWranglerBuild(rawConfig, bundler);
	return {
		...settings,
		followUps: deduplicateFollowUps([
			...settings.followUps,
			...build.followUps,
		]),
		toolingBase: build.toolingBase,
		toolingEnvironments: build.toolingEnvironments,
	};
}
