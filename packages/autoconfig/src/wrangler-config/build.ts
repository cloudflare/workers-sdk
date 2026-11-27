import {
	CONFIGURATION_DOCS_URL,
	ENVIRONMENTS_DOCS_URL,
	SOURCE_MAPS_DOCS_URL,
	createFollowUp,
	deduplicateFollowUps,
} from "../follow-ups";
import { createBranchSource, createPreviewSource } from "./branches";
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
import type {
	ConvertedBranch,
	ConvertedWranglerBuild,
	MigrationBundler,
	MigrationFollowUp,
	OutputObject,
	OutputProperty,
} from "./types";
import type { RawConfig } from "@cloudflare/workers-utils/config";

const VITE_DEFAULT_MODES = new Set(["development", "production"]);

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

/**
 * Reports a Wrangler assets directory, which the Vite build provides instead.
 *
 * @param source The branch's settings
 * @param sourcePrefix Where the branch is in the Wrangler config
 * @param followUps The follow-ups to add to
 */
function addViteAssetsDirectoryFollowUp(
	source: UnknownRecord,
	sourcePrefix: string,
	followUps: MigrationFollowUp[]
): void {
	const assets = getRecord(source, "assets");
	if (assets && hasOwn(assets, "directory")) {
		followUps.push(
			createFollowUp(
				"vite-assets-directory",
				"The Wrangler assets directory was not migrated. Configure static assets in the Vite project.",
				{
					docsUrl: CONFIGURATION_DOCS_URL,
					sourcePath: `${sourcePrefix ? `${sourcePrefix}.` : ""}assets.directory`,
				}
			)
		);
	}
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
	followUps: MigrationFollowUp[]
): void {
	addViteAssetsDirectoryFollowUp(source, sourcePrefix, followUps);
	const previews = getRecord(source, "previews");
	if (previews) {
		addViteAssetsDirectoryFollowUp(
			createPreviewSource(source, previews),
			`${sourcePrefix ? `${sourcePrefix}.` : ""}previews`,
			followUps
		);
	}
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
 * Converts a Wrangler config's build settings for a bundler. With Wrangler, they become the
 * branches of `wrangler.config.ts`. With Vite, which builds the Worker itself, they become
 * follow-ups for the settings that don't carry over.
 *
 * @param rawConfig The parsed contents of a Wrangler JSON, JSONC, or TOML configuration.
 * @param bundler The bundler the project builds with.
 *
 * @returns The `wrangler.config.ts` branches, and follow-ups for the build settings left out.
 */
export function convertWranglerBuild(
	rawConfig: RawConfig,
	bundler: MigrationBundler
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

		addViteBranchFollowUps(baseSource, "", followUps);
		for (const [name, environment] of environments) {
			addViteBranchFollowUps(
				createBranchSource(source, environment, name),
				`env.${name}`,
				followUps
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
