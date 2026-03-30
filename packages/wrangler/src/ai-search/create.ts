import { UserError } from "@cloudflare/workers-utils";
import { fetchPagedListResult } from "../cfetch";
import { createCommand } from "../core/create-command";
import { confirm, prompt, select } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { createR2Bucket, listR2Buckets } from "../r2/helpers/bucket";
import { requireAuth } from "../user";
import { createInstance, listTokens } from "./client";

const CREATE_NEW_BUCKET = "__create_new__";

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
				"The name of the AI Search instance to create (must be unique).",
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
			logger.log(`Creating AI Search instance "${instanceName}"...`);
		}
		const instance = await createInstance(config, accountId, body);

		if (args.json) {
			logger.log(JSON.stringify(instance, null, 2));
		} else {
			logger.log(
				`Successfully created AI Search instance "${instance.id}"\n` +
					`  Name:       ${instance.id}\n` +
					`  Type:       ${instance.type}\n` +
					`  Source:     ${instance.source}\n` +
					`  Model:      ${instance.ai_search_model ?? "default"}\n` +
					`  Embedding:  ${instance.embedding_model ?? "default"}`
			);
		}
	},
});
