import {
	addProperty,
	camelObject,
	getRecord,
	hasOwn,
	isRecord,
	optionsFromRecord,
	toOutputValue,
	type UnknownRecord,
} from "./converter-helpers";
import {
	CONFIGURATION_DOCS_URL,
	ENVIRONMENTS_DOCS_URL,
	PREVIEWS_DOCS_URL,
	SECRETS_DOCS_URL,
	createFollowUp,
	deduplicateFollowUps,
	followUpToComment,
} from "./follow-ups";
import { convertRootConfig } from "./worker-config";
import type {
	ConvertedBranch,
	ConvertedWranglerConfig,
	MigrationBundler,
	MigrationFollowUp,
	OutputObject,
	OutputProperty,
} from "./types";

const VITE_DEFAULT_MODES = new Set(["development", "production"]);

const NON_INHERITABLE_FIELDS = new Set([
	"agent_memory",
	"ai_search_namespaces",
	"ai_search",
	"ai",
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
	"kv_namespaces",
	"media",
	"mtls_certificates",
	"pipelines",
	"queues",
	"r2_buckets",
	"ratelimits",
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
]);

const TOOLING_FIELDS = new Set([
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
	"upload_source_maps",
	"wasm_modules",
]);

export const KNOWN_FIELDS = new Set([
	"$schema",
	"access",
	"account_id",
	"addresses",
	"agent_memory",
	"ai_search_namespaces",
	"ai_search",
	"ai",
	"alias",
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
]);

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

	Object.assign(merged, overrides);
	delete merged.previews;

	return merged;
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

function convertToolingObject(source: UnknownRecord): OutputObject | undefined {
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
		if (typeof dev.generate_types === "boolean") {
			properties.push({
				key: "types",
				value: {
					kind: "object",
					properties: [{ key: "generate", value: dev.generate_types }],
				},
			});
		}
	}

	const assets = getRecord(source, "assets");
	if (assets && typeof assets.directory === "string") {
		properties.push({ key: "assetsDirectory", value: assets.directory });
	}

	return properties.length > 0 ? { kind: "object", properties } : undefined;
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
	const assets = getRecord(source, "assets");
	if (assets && hasOwn(assets, "directory")) {
		toolingFields.push("assets.directory");
	}

	if (toolingFields.length === 0) {
		return;
	}

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

function convertBranch(
	source: UnknownRecord,
	sourcePrefix: string,
	bundler: MigrationBundler,
	imports: Set<string>,
	followUps: MigrationFollowUp[]
): ConvertedBranch {
	const config = convertRootConfig(
		source,
		sourcePrefix,
		bundler,
		imports,
		followUps
	);

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
			bundler,
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

	if (!config && !previewConfig) {
		return undefined;
	}

	return {
		config: config ?? { kind: "object", properties: [] },
		previewConfig: previews
			? (previewConfig ?? { kind: "object", properties: [] })
			: undefined,
	};
}

export function convertWranglerConfig(
	rawConfig: UnknownRecord,
	bundler: MigrationBundler,
	secretFiles: string[]
): ConvertedWranglerConfig {
	const source = rawConfig;
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
			if (bundler === "vite" && VITE_DEFAULT_MODES.has(name)) {
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

	if (bundler === "vite") {
		addViteToolingFollowUp(source, "", "", followUps);
		if (sourcePreviews) {
			addViteToolingFollowUp(sourcePreviews, "previews", "previews", followUps);
		}
	}

	const isWranglerBundle = bundler === "wrangler";
	if (isWranglerBundle) {
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
	}

	if (bundler === "vite") {
		for (const [name, environment] of Object.entries(environments)) {
			if (!isRecord(environment)) {
				continue;
			}

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
	}

	const baseSource = createBranchSource(source, {});
	const base = convertBranch(baseSource, "", bundler, imports, followUps);
	const toolingBase = isWranglerBundle
		? convertToolingBranch(baseSource)
		: undefined;
	const convertedEnvironments = new Map<string, ConvertedBranch>();
	const toolingEnvironments = new Map<string, ConvertedBranch>();

	for (const [name, value] of Object.entries(environments)) {
		if (!isRecord(value)) {
			continue;
		}

		const environmentSource = createBranchSource(source, value, name);
		convertedEnvironments.set(
			name,
			convertBranch(
				environmentSource,
				`env.${name}`,
				bundler,
				imports,
				followUps
			)
		);
		if (isWranglerBundle) {
			const tooling = convertToolingBranch(environmentSource);
			if (tooling || toolingBase) {
				toolingEnvironments.set(
					name,
					tooling ?? { config: { kind: "object", properties: [] } }
				);
			}
		}
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
		toolingBase,
		toolingEnvironments,
	};
}
