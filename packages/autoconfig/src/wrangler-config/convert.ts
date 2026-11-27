import {
	CONFIGURATION_DOCS_URL,
	ENVIRONMENTS_DOCS_URL,
	PREVIEWS_DOCS_URL,
	SECRETS_DOCS_URL,
	createFollowUp,
	deduplicateFollowUps,
	followUpToComment,
} from "../follow-ups";
import { createBranchSource, createPreviewSource } from "./branches";
import { convertWranglerBuild } from "./build";
import { getRecord, isRecord, type UnknownRecord } from "./helpers";
import { convertRootConfig } from "./worker";
import type {
	ConvertedBranch,
	ConvertedWranglerConfig,
	ConvertedWranglerSettings,
	MigrationBundler,
	MigrationFollowUp,
} from "./types";
import type { RawConfig } from "@cloudflare/workers-utils/config";

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
