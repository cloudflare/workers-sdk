import chalk from "chalk";
import { formatConfigSnippet, readConfig } from "../../config";
import { FatalError, UserError } from "../../errors";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { getValidBindingName } from "../../utils/getValidBindingName";
import { printWranglerBanner } from "../../wrangler-banner";
import { createPipeline } from "../client";
import {
	authorizeR2Bucket,
	BYTES_PER_MB,
	formatPipelinePretty,
	getAccountR2Endpoint,
	parseTransform,
} from "../index";
import { validateCorsOrigins, validateInRange } from "../validate";
import type {
	CommonYargsOptions,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type {
	BindingSource,
	HttpSource,
	PipelineUserConfig,
	Source,
} from "../client";
import type { Argv } from "yargs";

export function addCreateOptions(yargs: Argv<CommonYargsOptions>) {
	return (
		yargs
			.positional("pipeline", {
				describe: "The name of the new pipeline",
				type: "string",
				demandOption: true,
			})
			// Sources
			.group(
				["source", "require-http-auth", "cors-origins"],
				`${chalk.bold("Source settings")}`
			)
			.option("source", {
				type: "array",
				describe:
					"Space separated list of allowed sources. Options are 'http' or 'worker'",
				default: ["http", "worker"],
				demandOption: false,
			})
			.option("require-http-auth", {
				type: "boolean",
				describe:
					"Require Cloudflare API Token for HTTPS endpoint authentication",
				default: false,
				demandOption: false,
			})
			.option("cors-origins", {
				type: "array",
				describe:
					"CORS origin allowlist for HTTP endpoint (use * for any origin). Defaults to an empty array",
				demandOption: false,
				coerce: validateCorsOrigins,
			})

			// Batching
			.group(
				["batch-max-mb", "batch-max-rows", "batch-max-seconds"],
				`${chalk.bold("Batch hints")}`
			)
			.option("batch-max-mb", {
				type: "number",
				describe:
					"Maximum batch size in megabytes before flushing. Defaults to 100 MB if unset. Minimum: 1, Maximum: 100",
				demandOption: false,
				coerce: validateInRange("batch-max-mb", 1, 100),
			})
			.option("batch-max-rows", {
				type: "number",
				describe:
					"Maximum number of rows per batch before flushing. Defaults to 10,000,000 if unset. Minimum: 100, Maximum: 10,000,000",
				demandOption: false,
				coerce: validateInRange("batch-max-rows", 100, 10_000_000),
			})
			.option("batch-max-seconds", {
				type: "number",
				describe:
					"Maximum age of batch in seconds before flushing. Defaults to 300 if unset. Minimum: 1, Maximum: 300",

				demandOption: false,
				coerce: validateInRange("batch-max-seconds", 1, 300),
			})

			// Transform options
			.group(["transform-worker"], `${chalk.bold("Transformations")}`)
			.option("transform-worker", {
				type: "string",
				describe:
					"Pipeline transform Worker and entrypoint (<worker>.<entrypoint>)",
				demandOption: false,
				hidden: true, // TODO: Remove once transformations launch
			})

			// Destination options
			.group(
				[
					"r2-bucket",
					"r2-access-key-id",
					"r2-secret-access-key",
					"r2-prefix",
					"compression",
				],
				`${chalk.bold("Destination settings")}`
			)
			.option("r2-bucket", {
				type: "string",
				describe: "Destination R2 bucket name",
				demandOption: true,
			})
			.option("r2-access-key-id", {
				type: "string",
				describe:
					"R2 service Access Key ID for authentication. Leave empty for OAuth confirmation.",
				demandOption: false,
			})
			.option("r2-secret-access-key", {
				type: "string",
				describe:
					"R2 service Secret Access Key for authentication. Leave empty for OAuth confirmation.",
				demandOption: false,
			})
			// Require these flags to be provided together
			.implies("r2-access-key-id", "r2-secret-access-key")
			.implies("r2-secret-access-key", "r2-access-key-id")
			.check((argv) => {
				if (
					(argv["r2-access-key-id"] && !argv["r2-secret-access-key"]) ||
					(!argv["r2-access-key-id"] && argv["r2-secret-access-key"])
				) {
					throw new UserError(
						"--r2-access-key-id and --r2-secret-access-key must be provided together"
					);
				}
				return true;
			})
			.option("r2-prefix", {
				type: "string",
				describe:
					"Prefix for storing files in the destination bucket. Default is no prefix",
				default: "",
				demandOption: false,
			})
			.option("compression", {
				type: "string",
				describe: "Compression format for output files",
				choices: ["none", "gzip", "deflate"],
				default: "gzip",
				demandOption: false,
			})

			// Pipeline settings
			.group(["shard-count"], `${chalk.bold("Pipeline settings")}`)
			.option("shard-count", {
				type: "number",
				describe:
					"Number of shards for the pipeline. More shards handle higher request volume; fewer shards produce larger output files. Defaults to 2 if unset. Minimum: 1, Maximum: 15",
				demandOption: false,
			})
	);
}

export async function createPipelineHandler(
	args: StrictYargsOptionsToInterface<typeof addCreateOptions>
) {
	await printWranglerBanner();

	const config = readConfig(args);
	const bucket = args.r2Bucket;
	const name = args.pipeline;
	const compression = args.compression;

	const batch = {
		max_bytes: args.batchMaxMb
			? args.batchMaxMb * BYTES_PER_MB // convert to bytes for the API
			: undefined,
		max_duration_s: args.batchMaxSeconds,
		max_rows: args.batchMaxRows,
	};

	const accountId = await requireAuth(config);
	const pipelineConfig: PipelineUserConfig = {
		name: name,
		metadata: {},
		source: [],
		transforms: [],
		destination: {
			type: "r2",
			format: "json",
			compression: {
				type: compression,
			},
			batch: batch,
			path: {
				bucket: bucket,
			},
			credentials: {
				endpoint: getAccountR2Endpoint(accountId),
				access_key_id: args.r2AccessKeyId || "",
				secret_access_key: args.r2SecretAccessKey || "",
			},
		},
	};
	const destination = pipelineConfig.destination;
	if (
		!destination.credentials.access_key_id &&
		!destination.credentials.secret_access_key
	) {
		// auto-generate a service token
		const auth = await authorizeR2Bucket(
			name,
			accountId,
			pipelineConfig.destination.path.bucket
		);
		destination.credentials.access_key_id = auth.accessKeyId;
		destination.credentials.secret_access_key = auth.secretAccessKey;
	}

	if (!destination.credentials.access_key_id) {
		throw new FatalError("Requires a r2 access key id");
	}

	if (!destination.credentials.secret_access_key) {
		throw new FatalError("Requires a r2 secret access key");
	}

	if (args.source.length > 0) {
		const sourceHandlers: Record<string, () => Source> = {
			http: (): HttpSource => {
				const http: HttpSource = {
					type: "http",
					format: "json",
					authentication: args.requireHttpAuth,
				};

				if (args.corsOrigins && args.corsOrigins.length > 0) {
					http.cors = { origins: args.corsOrigins };
				}

				return http;
			},
			worker: (): BindingSource => ({
				type: "binding",
				format: "json",
			}),
		};

		for (const source of args.source) {
			const handler = sourceHandlers[source];
			if (handler) {
				pipelineConfig.source.push(handler());
			}
		}
	}

	if (pipelineConfig.source.length === 0) {
		throw new UserError(
			"No sources have been enabled. At least one source (HTTP or Worker Binding) should be enabled"
		);
	}

	if (args.transformWorker) {
		pipelineConfig.transforms.push(parseTransform(args.transformWorker));
	}

	if (args.r2Prefix) {
		pipelineConfig.destination.path.prefix = args.r2Prefix;
	}
	if (args.shardCount) {
		pipelineConfig.metadata.shards = args.shardCount;
	}

	logger.log(`🌀 Creating pipeline named "${name}"`);
	const pipeline = await createPipeline(accountId, pipelineConfig);

	logger.log(
		`✅ Successfully created pipeline "${pipeline.name}" with ID ${pipeline.id}\n`
	);
	logger.log(formatPipelinePretty(pipeline));
	logger.log("🎉 You can now send data to your pipeline!");

	if (args.source.includes("worker")) {
		logger.log(
			`\nTo send data to your pipeline from a Worker, add the following to your wrangler config file:\n`
		);
		logger.log(
			formatConfigSnippet(
				{
					pipelines: [
						{
							pipeline: pipeline.name,
							binding: getValidBindingName("PIPELINE", "PIPELINE"),
						},
					],
				},
				config.configPath
			)
		);
	}

	if (args.source.includes("http")) {
		logger.log(`\nSend data to your pipeline's HTTP endpoint:\n`);
		logger.log(`curl "${pipeline.endpoint}" -d '[{"foo": "bar"}]'\n`);
	}
}
