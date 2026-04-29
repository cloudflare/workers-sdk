import path from "node:path";
import { parseJSON, readFileSync, UserError } from "@cloudflare/workers-utils";
import { fetchPagedListResult } from "../cfetch";
import { createCommand } from "../core/create-command";
import { confirm, prompt, select } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { createR2Bucket, listR2Buckets } from "../r2/helpers/bucket";
import { requireAuth } from "../user";
import {
	createInstance,
	createNamespace,
	DEFAULT_NAMESPACE,
	listNamespaces,
	listTokens,
} from "./client";
import type {
	AiSearchCustomMetadata,
	AiSearchCustomMetadataDataType,
} from "./types";

const CREATE_NEW_BUCKET = "__create_new__";
const CREATE_NEW_NAMESPACE = "__create_new__";

const CUSTOM_METADATA_DATA_TYPES = [
	"text",
	"number",
	"boolean",
	"datetime",
] as const satisfies readonly AiSearchCustomMetadataDataType[];

// Reserved field names rejected by the AI Search backend; validated client-side
// for fast feedback. Keep in sync with apps/config-api validation rules.
const CUSTOM_METADATA_RESERVED_FIELD_NAMES = new Set([
	"timestamp",
	"folder",
	"filename",
]);

const CUSTOM_METADATA_MAX_ENTRIES = 20;

function isCustomMetadataDataType(
	value: string
): value is AiSearchCustomMetadataDataType {
	return (CUSTOM_METADATA_DATA_TYPES as readonly string[]).includes(value);
}

function validateCustomMetadataFieldName(
	fieldName: string,
	existing: AiSearchCustomMetadata[]
): true | string {
	if (fieldName.length === 0) {
		return "Field name is required.";
	}
	if (CUSTOM_METADATA_RESERVED_FIELD_NAMES.has(fieldName.toLowerCase())) {
		return `"${fieldName}" is a reserved field name. Reserved: ${[...CUSTOM_METADATA_RESERVED_FIELD_NAMES].join(", ")}.`;
	}
	const lower = fieldName.toLowerCase();
	if (existing.some((m) => m.field_name.toLowerCase() === lower)) {
		return `Field name "${fieldName}" is already defined.`;
	}
	return true;
}

function parseCustomMetadataFlag(
	values: ReadonlyArray<string | number>
): AiSearchCustomMetadata[] {
	const result: AiSearchCustomMetadata[] = [];
	for (const value of values) {
		const raw = String(value);
		const idx = raw.indexOf(":");
		if (idx === -1) {
			throw new UserError(
				`Invalid --custom-metadata value "${raw}". ` +
					`Expected format: field_name:data_type ` +
					`(data_type one of ${CUSTOM_METADATA_DATA_TYPES.join(", ")}).`
			);
		}
		const fieldName = raw.slice(0, idx).trim();
		const dataType = raw.slice(idx + 1).trim();
		const fieldValidation = validateCustomMetadataFieldName(fieldName, result);
		if (fieldValidation !== true) {
			throw new UserError(
				`Invalid --custom-metadata value "${raw}": ${fieldValidation}`
			);
		}
		if (!isCustomMetadataDataType(dataType)) {
			throw new UserError(
				`Invalid --custom-metadata value "${raw}": data_type must be one of ${CUSTOM_METADATA_DATA_TYPES.join(", ")}.`
			);
		}
		result.push({ field_name: fieldName, data_type: dataType });
	}
	if (result.length > CUSTOM_METADATA_MAX_ENTRIES) {
		throw new UserError(
			`At most ${CUSTOM_METADATA_MAX_ENTRIES} custom metadata fields are allowed (got ${result.length}).`
		);
	}
	return result;
}

/**
 * Reads a JSON file describing custom metadata fields and returns the parsed
 * list. Accepts two shapes:
 *   1. A bare array:        `[{ "field_name": "title", "data_type": "text" }]`
 *   2. An object wrapper:   `{ "custom_metadata": [...] }` (matches the API
 *      request body shape, so users can paste examples from the docs).
 */
function parseCustomMetadataSchemaFile(
	filePath: string
): AiSearchCustomMetadata[] {
	const resolvedPath = path.resolve(filePath);
	const parsed = parseJSON(readFileSync(resolvedPath), resolvedPath) as unknown;

	let entries: unknown;
	if (Array.isArray(parsed)) {
		entries = parsed;
	} else if (
		parsed !== null &&
		typeof parsed === "object" &&
		"custom_metadata" in parsed
	) {
		entries = (parsed as { custom_metadata: unknown }).custom_metadata;
	} else {
		throw new UserError(
			`Invalid custom metadata schema in "${resolvedPath}". ` +
				`Expected either an array of { field_name, data_type } objects, ` +
				`or an object with a "custom_metadata" array.`
		);
	}

	if (!Array.isArray(entries)) {
		throw new UserError(
			`Invalid custom metadata schema in "${resolvedPath}". ` +
				`"custom_metadata" must be an array.`
		);
	}

	const result: AiSearchCustomMetadata[] = [];
	entries.forEach((entry, index) => {
		if (entry === null || typeof entry !== "object") {
			throw new UserError(
				`Invalid custom metadata entry at index ${index} in "${resolvedPath}": ` +
					`expected an object with "field_name" and "data_type".`
			);
		}
		const { field_name: fieldNameRaw, data_type: dataTypeRaw } = entry as {
			field_name?: unknown;
			data_type?: unknown;
		};
		if (typeof fieldNameRaw !== "string") {
			throw new UserError(
				`Invalid custom metadata entry at index ${index} in "${resolvedPath}": ` +
					`"field_name" must be a string.`
			);
		}
		if (typeof dataTypeRaw !== "string") {
			throw new UserError(
				`Invalid custom metadata entry at index ${index} in "${resolvedPath}": ` +
					`"data_type" must be a string.`
			);
		}
		const fieldName = fieldNameRaw.trim();
		const fieldValidation = validateCustomMetadataFieldName(fieldName, result);
		if (fieldValidation !== true) {
			throw new UserError(
				`Invalid custom metadata entry at index ${index} in "${resolvedPath}": ${fieldValidation}`
			);
		}
		if (!isCustomMetadataDataType(dataTypeRaw)) {
			throw new UserError(
				`Invalid custom metadata entry at index ${index} in "${resolvedPath}": ` +
					`"data_type" must be one of ${CUSTOM_METADATA_DATA_TYPES.join(", ")}.`
			);
		}
		result.push({ field_name: fieldName, data_type: dataTypeRaw });
	});

	if (result.length > CUSTOM_METADATA_MAX_ENTRIES) {
		throw new UserError(
			`At most ${CUSTOM_METADATA_MAX_ENTRIES} custom metadata fields are allowed (got ${result.length}) in "${resolvedPath}".`
		);
	}
	return result;
}

export const aiSearchCreateCommand = createCommand({
	metadata: {
		description: "Create a new AI Search instance",
		status: "open beta",
		owner: "Product: AI Search",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description:
				"The name of the AI Search instance to create (must be unique within its namespace).",
		},
		namespace: {
			type: "string",
			alias: "n",
			description: "The namespace to create the instance in.",
		},
		source: {
			type: "string",
			description: "Data source identifier (R2 bucket name or web URL).",
		},
		type: {
			type: "string",
			choices: ["r2", "web-crawler"],
			description: "The source type for the instance.",
		},
		"embedding-model": {
			type: "string",
			description: "Embedding model to use.",
		},
		"generation-model": {
			type: "string",
			description: "LLM model for chat completions.",
		},
		"chunk-size": {
			type: "number",
			description: "Chunk size for document splitting (min: 64).",
		},
		"chunk-overlap": {
			type: "number",
			description: "Overlap between document chunks.",
		},
		"max-num-results": {
			type: "number",
			description: "Maximum search results per query.",
		},
		reranking: {
			type: "boolean",
			description: "Enable reranking of search results.",
		},
		"reranking-model": {
			type: "string",
			description: "Model to use for reranking.",
		},
		"hybrid-search": {
			type: "boolean",
			description: "Enable hybrid (keyword + vector) search.",
		},
		cache: {
			type: "boolean",
			description: "Enable response caching.",
		},
		"score-threshold": {
			type: "number",
			description: "Minimum relevance score threshold (0-1).",
		},
		prefix: {
			type: "string",
			description: "R2 key prefix to scope indexing.",
		},
		"include-items": {
			type: "array",
			string: true,
			description: "Glob patterns for items to include.",
		},
		"exclude-items": {
			type: "array",
			string: true,
			description: "Glob patterns for items to exclude.",
		},
		"custom-metadata": {
			type: "array",
			string: true,
			description:
				"Custom metadata fields, formatted as 'field_name:data_type'. " +
				`data_type must be one of: ${CUSTOM_METADATA_DATA_TYPES.join(", ")}. ` +
				"Repeat the flag for multiple fields (e.g. --custom-metadata title:text --custom-metadata views:number).",
		},
		"custom-metadata-schema": {
			type: "string",
			requiresArg: true,
			description:
				"Path to a JSON file describing custom metadata fields. " +
				'The file may contain either an array of { "field_name", "data_type" } ' +
				'objects or an object of the form { "custom_metadata": [...] }. ' +
				"Mutually exclusive with --custom-metadata.",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		// Get accountId early — needed for listing R2 buckets and zones
		const accountId = await requireAuth(config);

		// Check for AI Search API tokens before proceeding
		const existingTokens = await listTokens(config, accountId);
		if (existingTokens.length === 0) {
			if (isNonInteractiveOrCI()) {
				throw new UserError(
					`No AI Search API token found. Create one at:\n` +
						`  https://dash.cloudflare.com/${accountId}/ai/ai-search/tokens\n` +
						`Then re-run this command.`
				);
			}
			logger.log(
				`No AI Search API token found. Create one at:\n` +
					`  https://dash.cloudflare.com/${accountId}/ai/ai-search/tokens`
			);
			let hasToken = false;
			while (!hasToken) {
				const ready = await confirm("Have you created a token?");
				if (!ready) {
					throw new UserError("AI Search instance creation cancelled.");
				}
				const tokens = await listTokens(config, accountId);
				if (tokens.length > 0) {
					hasToken = true;
				} else {
					logger.log(
						"No token found yet. Please create one before continuing."
					);
				}
			}
		}

		// Interactive wizard: prompt for missing required fields
		const instanceName = args.name;

		// 0. Namespace — either explicitly passed, picked interactively, or "default"
		let instanceNamespace = args.namespace;
		if (instanceNamespace === undefined) {
			if (isNonInteractiveOrCI() || args.json) {
				instanceNamespace = DEFAULT_NAMESPACE;
			} else {
				const namespaces = await listNamespaces(config);
				// The list endpoint does not return the "default" namespace, so
				// surface it explicitly so users can target it from the picker.
				const hasDefault = namespaces.some(
					(ns) => ns.name === DEFAULT_NAMESPACE
				);
				const namespaceChoices = [
					...(hasDefault
						? []
						: [{ title: DEFAULT_NAMESPACE, value: DEFAULT_NAMESPACE }]),
					...namespaces.map((ns) => ({
						title: ns.name,
						description: ns.description,
						value: ns.name,
					})),
					{
						title: "Create new namespace",
						description: "Provision a brand-new namespace for this instance",
						value: CREATE_NEW_NAMESPACE,
					},
				];
				// Start with "default" highlighted if present in the list.
				const defaultIndex = namespaceChoices.findIndex(
					(choice) => choice.value === DEFAULT_NAMESPACE
				);
				const selectedNamespace = await select("Select a namespace:", {
					choices: namespaceChoices,
					defaultOption: defaultIndex >= 0 ? defaultIndex : 0,
				});

				if (selectedNamespace === CREATE_NEW_NAMESPACE) {
					const newNamespaceName = await prompt(
						"Enter a name for the new namespace:",
						{
							validate: (value: string) =>
								value.length > 0 || "Namespace name is required.",
						}
					);
					logger.log(`Creating namespace "${newNamespaceName}"...`);
					await createNamespace(config, accountId, {
						name: newNamespaceName,
					});
					logger.log(`Successfully created namespace "${newNamespaceName}".`);
					instanceNamespace = newNamespaceName;
				} else {
					instanceNamespace = selectedNamespace;
				}
			}
		}

		// 1. Source type
		let instanceType = args.type;
		if (!instanceType) {
			if (isNonInteractiveOrCI()) {
				throw new UserError(
					"Missing required flag in non-interactive mode: --type\n" +
						"  Pass --type r2 or --type web-crawler."
				);
			}
			instanceType = await select("Select the source type:", {
				choices: [
					{
						title: "R2",
						description: "Index files from an R2 bucket",
						value: "r2" as const,
					},
					{
						title: "Web",
						description: "Index content from a website",
						value: "web-crawler" as const,
					},
				],
				defaultOption: 0,
			});
		}

		// 2. Source selection — depends on the type
		let instanceSource = args.source;
		// Track whether the user went through the web/sitemap interactive flow
		let webParseType: string | undefined;

		if (instanceType === "r2" && !instanceSource) {
			if (isNonInteractiveOrCI()) {
				throw new UserError(
					"Missing required flag in non-interactive mode: --source\n" +
						"  Pass --source <r2-bucket-name>."
				);
			}
			// 2.1 R2: list buckets and let user pick, with "Create new" option
			const buckets = await listR2Buckets(config, accountId);
			const bucketChoices = [
				...buckets.map((b) => ({
					title: b.name,
					value: b.name,
				})),
				{
					title: "Create new bucket",
					description: "Create a new R2 bucket for this instance",
					value: CREATE_NEW_BUCKET,
				},
			];

			const selectedBucket = await select("Select an R2 bucket:", {
				choices: bucketChoices,
				defaultOption: 0,
			});

			if (selectedBucket === CREATE_NEW_BUCKET) {
				const newBucketName = await prompt(
					"Enter a name for the new R2 bucket:",
					{
						validate: (value: string) =>
							value.length > 0 || "Bucket name is required.",
					}
				);
				logger.log(`Creating R2 bucket "${newBucketName}"...`);
				await createR2Bucket(config, accountId, newBucketName);
				logger.log(`Successfully created R2 bucket "${newBucketName}".`);
				instanceSource = newBucketName;
			} else {
				instanceSource = selectedBucket;
			}
		} else if (instanceType === "web-crawler" && !instanceSource) {
			if (isNonInteractiveOrCI()) {
				throw new UserError(
					"Missing required flag in non-interactive mode: --source\n" +
						"  Pass --source <url> (e.g. --source https://example.com)."
				);
			}
			// 2.2 Web: select source type (sitemap only for now), then list zones
			// fallbackOption: 0 is safe — sitemap is the only available option
			webParseType = await select("Select the web source type:", {
				choices: [
					{
						title: "Sitemap",
						description: "Crawl and index pages from a sitemap",
						value: "sitemap" as const,
					},
				],
				defaultOption: 0,
				fallbackOption: 0,
			});

			// List all zones for the account
			const zones = await fetchPagedListResult<{
				id: string;
				name: string;
			}>(
				config,
				"/zones",
				{},
				new URLSearchParams({ "account.id": accountId })
			);

			if (zones.length === 0) {
				// Fallback to manual URL entry if no zones found
				instanceSource = await prompt("Enter the website URL to index:", {
					validate: (value: string) => {
						if (value.length === 0) {
							return "Source is required.";
						}
						try {
							new URL(value);
							return true;
						} catch {
							return "Please enter a valid URL (e.g. https://example.com).";
						}
					},
				});
			} else {
				const selectedZone = await select("Select a zone:", {
					choices: zones.map((z) => ({
						title: z.name,
						description: z.id,
						value: z.name,
					})),
					defaultOption: 0,
				});
				instanceSource = `https://${selectedZone}`;
			}
		}

		// 3. Custom metadata (optional). Honors --custom-metadata or
		// --custom-metadata-schema; otherwise prompts interactively when
		// running attached to a TTY.
		if (
			args.customMetadata &&
			args.customMetadata.length > 0 &&
			args.customMetadataSchema
		) {
			throw new UserError(
				"--custom-metadata and --custom-metadata-schema are mutually exclusive. " +
					"Pick one."
			);
		}
		let customMetadata: AiSearchCustomMetadata[] = [];
		if (args.customMetadata && args.customMetadata.length > 0) {
			customMetadata = parseCustomMetadataFlag(args.customMetadata);
		} else if (args.customMetadataSchema) {
			customMetadata = parseCustomMetadataSchemaFile(args.customMetadataSchema);
		} else if (!isNonInteractiveOrCI() && !args.json) {
			const configure = await confirm(
				"Configure custom metadata fields? (optional)",
				{ defaultValue: false }
			);
			if (configure) {
				let addAnother = true;
				while (addAnother) {
					const fieldName = await prompt("Field name:", {
						validate: (value: string) =>
							validateCustomMetadataFieldName(value.trim(), customMetadata),
					});
					const dataType = await select("Data type:", {
						choices: CUSTOM_METADATA_DATA_TYPES.map((t) => ({
							title: t,
							value: t,
						})),
						defaultOption: 0,
					});
					customMetadata.push({
						field_name: fieldName.trim(),
						data_type: dataType,
					});
					if (customMetadata.length >= CUSTOM_METADATA_MAX_ENTRIES) {
						logger.log(
							`Reached the maximum of ${CUSTOM_METADATA_MAX_ENTRIES} custom metadata fields.`
						);
						addAnother = false;
					} else {
						addAnother = await confirm("Add another field?", {
							defaultValue: false,
						});
					}
				}
			}
		}

		const body: Record<string, unknown> = {
			id: instanceName,
			source: instanceSource,
			type: instanceType,
		};

		if (args.embeddingModel !== undefined) {
			body.embedding_model = args.embeddingModel;
		}
		if (args.generationModel !== undefined) {
			body.ai_search_model = args.generationModel;
		}
		if (args.chunkSize !== undefined) {
			body.chunk_size = args.chunkSize;
		}
		if (args.chunkOverlap !== undefined) {
			body.chunk_overlap = args.chunkOverlap;
		}
		if (args.maxNumResults !== undefined) {
			body.max_num_results = args.maxNumResults;
		}
		if (args.reranking !== undefined) {
			body.reranking = args.reranking;
		}
		if (args.rerankingModel !== undefined) {
			body.reranking_model = args.rerankingModel;
		}
		if (args.hybridSearch !== undefined) {
			body.hybrid_search_enabled = args.hybridSearch;
		}
		if (args.cache !== undefined) {
			body.cache = args.cache;
		}
		if (args.scoreThreshold !== undefined) {
			body.score_threshold = args.scoreThreshold;
		}
		if (customMetadata.length > 0) {
			body.custom_metadata = customMetadata;
		}

		const sourceParams: Record<string, unknown> = {};
		if (args.prefix) {
			sourceParams.prefix = args.prefix;
		}
		if (args.includeItems) {
			sourceParams.include_items = args.includeItems;
		}
		if (args.excludeItems) {
			sourceParams.exclude_items = args.excludeItems;
		}
		if (webParseType) {
			sourceParams.web_crawler = {
				parse_type: webParseType,
			};
		}
		if (Object.keys(sourceParams).length > 0) {
			body.source_params = sourceParams;
		}

		if (!args.json) {
			logger.log(
				`Creating AI Search instance "${instanceName}" in namespace "${instanceNamespace}"...`
			);
		}
		const instance = await createInstance(
			config,
			accountId,
			instanceNamespace,
			body
		);

		if (args.json) {
			logger.log(JSON.stringify(instance, null, 2));
		} else {
			let summary =
				`Successfully created AI Search instance "${instance.id}"\n` +
				`  Name:       ${instance.id}\n` +
				`  Namespace:  ${instance.namespace ?? instanceNamespace}\n` +
				`  Type:       ${instance.type}\n` +
				`  Source:     ${instance.source}\n` +
				`  Model:      ${instance.ai_search_model ?? "default"}\n` +
				`  Embedding:  ${instance.embedding_model ?? "default"}`;
			if (instance.custom_metadata && instance.custom_metadata.length > 0) {
				const fields = instance.custom_metadata
					.map((m) => `${m.field_name}:${m.data_type}`)
					.join(", ");
				summary += `\n  Metadata:   ${fields}`;
			}
			logger.log(summary);
		}
	},
});
