import { createCommand } from "../../core/create-command";
import { FatalError, UserError } from "../../errors";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { getPipeline, updatePipeline } from "../client";
import {
	authorizeR2Bucket,
	BYTES_PER_MB,
	getAccountR2Endpoint,
	parseTransform,
} from "../index";
import { validateCorsOrigins, validateInRange } from "../validate";
import type { BindingSource, HttpSource, Source } from "../client";

export const pipelinesUpdateCommand = createCommand({
	metadata: {
		description: "Update a pipeline",
		owner: "Product: Pipelines",
		status: "open-beta",
	},
	positionalArgs: ["pipeline"],
	args: {
		pipeline: {
			describe: "The name of the new pipeline",
			type: "string",
			demandOption: true,
		},

		source: {
			type: "array",
			describe:
				"Space separated list of allowed sources. Options are 'http' or 'worker'",
			group: "Source settings",
		},
		"require-http-auth": {
			type: "boolean",
			describe:
				"Require Cloudflare API Token for HTTPS endpoint authentication",
			group: "Source settings",
		},
		"cors-origins": {
			type: "array",
			describe:
				"CORS origin allowlist for HTTP endpoint (use * for any origin). Defaults to an empty array",
			demandOption: false,
			coerce: validateCorsOrigins,
			group: "Source settings",
		},

		"batch-max-mb": {
			type: "number",
			describe:
				"Maximum batch size in megabytes before flushing. Defaults to 100 MB if unset. Minimum: 1, Maximum: 100",
			demandOption: false,
			coerce: validateInRange("batch-max-mb", 1, 100),
			group: "Batch hints",
		},
		"batch-max-rows": {
			type: "number",
			describe:
				"Maximum number of rows per batch before flushing. Defaults to 10,000,000 if unset. Minimum: 100, Maximum: 10,000,000",
			demandOption: false,
			coerce: validateInRange("batch-max-rows", 100, 10_000_000),
			group: "Batch hints",
		},
		"batch-max-seconds": {
			type: "number",
			describe:
				"Maximum age of batch in seconds before flushing. Defaults to 300 if unset. Minimum: 1, Maximum: 300",

			demandOption: false,
			coerce: validateInRange("batch-max-seconds", 1, 300),
			group: "Batch hints",
		},

		// Transform options
		"transform-worker": {
			type: "string",
			describe:
				"Pipeline transform Worker and entrypoint (<worker>.<entrypoint>)",
			demandOption: false,
			hidden: true, // TODO: Remove once transformations launch
			group: "Transformations",
		},

		"r2-bucket": {
			type: "string",
			describe: "Destination R2 bucket name",
			group: "Destination settings",
		},
		"r2-access-key-id": {
			type: "string",
			describe:
				"R2 service Access Key ID for authentication. Leave empty for OAuth confirmation.",
			demandOption: false,
			group: "Destination settings",
			implies: "r2-secret-access-key",
		},
		"r2-secret-access-key": {
			type: "string",
			describe:
				"R2 service Secret Access Key for authentication. Leave empty for OAuth confirmation.",
			demandOption: false,
			group: "Destination settings",
			implies: "r2-access-key-id",
		},

		"r2-prefix": {
			type: "string",
			describe:
				"Prefix for storing files in the destination bucket. Default is no prefix",
			demandOption: false,
			group: "Destination settings",
		},
		compression: {
			type: "string",
			describe: "Compression format for output files",
			choices: ["none", "gzip", "deflate"],
			demandOption: false,
			group: "Destination settings",
		},

		// Pipeline settings
		"shard-count": {
			type: "number",
			describe:
				"Number of shards for the pipeline. More shards handle higher request volume; fewer shards produce larger output files. Defaults to 2 if unset. Minimum: 1, Maximum: 15",
			demandOption: false,
			group: "Pipeline settings",
		},
	},
	async handler(args, { config }) {
		const name = args.pipeline;
		// only the fields set will be updated - other fields will use the existing config
		const accountId = await requireAuth(config);

		const pipelineConfig = await getPipeline(accountId, name);

		if (args.compression) {
			pipelineConfig.destination.compression.type = args.compression;
		}
		if (args.batchMaxMb) {
			pipelineConfig.destination.batch.max_bytes =
				args.batchMaxMb * BYTES_PER_MB; // convert to bytes for the API
		}
		if (args.batchMaxSeconds) {
			pipelineConfig.destination.batch.max_duration_s = args.batchMaxSeconds;
		}
		if (args.batchMaxRows) {
			pipelineConfig.destination.batch.max_rows = args.batchMaxRows;
		}

		const bucket = args.r2Bucket;
		const accessKeyId = args.r2AccessKeyId;
		const secretAccessKey = args.r2SecretAccessKey;
		if (bucket || accessKeyId || secretAccessKey) {
			const destination = pipelineConfig.destination;
			if (bucket) {
				pipelineConfig.destination.path.bucket = bucket;
			}
			destination.credentials = {
				endpoint: getAccountR2Endpoint(accountId),
				access_key_id: accessKeyId || "",
				secret_access_key: secretAccessKey || "",
			};
			if (!accessKeyId && !secretAccessKey) {
				const auth = await authorizeR2Bucket(
					name,
					accountId,
					destination.path.bucket
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
		}

		if (args.source && args.source.length > 0) {
			const existingSources = pipelineConfig.source;
			pipelineConfig.source = []; // Reset the list

			const sourceHandlers: Record<string, () => Source> = {
				http: (): HttpSource => {
					const existing = existingSources.find(
						(s: Source) => s.type === "http"
					);

					return {
						...existing, // Copy over existing properties for forwards compatibility
						type: "http",
						format: "json",
						...(args.requireHttpAuth && {
							authentication: args.requireHttpAuth,
						}), // Include only if defined
					};
				},
				worker: (): BindingSource => {
					const existing = existingSources.find(
						(s: Source) => s.type === "binding"
					);

					return {
						...existing, // Copy over existing properties for forwards compatibility
						type: "binding",
						format: "json",
					};
				},
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
			if (args.transformWorker === "none") {
				// Unset transformations
				pipelineConfig.transforms = [];
			} else {
				pipelineConfig.transforms.push(parseTransform(args.transformWorker));
			}
		}

		if (args.r2Prefix) {
			pipelineConfig.destination.path.prefix = args.r2Prefix;
		}

		if (args.shardCount) {
			pipelineConfig.metadata.shards = args.shardCount;
		}

		// This covers the case where `--source` wasn't passed but `--cors-origins` or
		// `--require-http-auth` was.
		const httpSource = pipelineConfig.source.find(
			(s: Source) => s.type === "http"
		);
		if (httpSource) {
			if (args.requireHttpAuth) {
				httpSource.authentication = args.requireHttpAuth;
			}
			if (args.corsOrigins) {
				httpSource.cors = { origins: args.corsOrigins };
			}
		}

		logger.log(`🌀 Updating pipeline "${name}"`);
		const pipeline = await updatePipeline(accountId, name, pipelineConfig);

		logger.log(
			`✅ Successfully updated pipeline "${pipeline.name}" with ID ${pipeline.id}\n`
		);
	},
});
