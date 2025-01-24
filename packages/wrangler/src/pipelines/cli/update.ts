import { readConfig } from "../../config";
import { FatalError } from "../../errors";
import { logger } from "../../logger";
import * as metrics from "../../metrics";
import { requireAuth } from "../../user";
import { printWranglerBanner } from "../../wrangler-banner";
import { getPipeline, updatePipeline } from "../client";
import {
	authorizeR2Bucket,
	BYTES_PER_MB,
	getAccountR2Endpoint,
	parseTransform,
} from "../index";
import { validateCorsOrigins, validateInRange } from "../validate";
import type {
	CommonYargsOptions,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type { HttpSource, Source } from "../client";
import type { Argv } from "yargs";

/**
 * Add all the positional and optional flags for the `wrangler pipelines update` command.
 *
 * @param yargs
 */
export function addUpdateOptions(yargs: Argv<CommonYargsOptions>) {
	/* These arguments are nearly identical to the option used for creating a pipeline, with some notable differences.
		 Particularly, not all options are available for updating, and the default values have been removed. In this case, 
		 `undefined` is used to determine if the user provided that flag at all with the intent to change the value.
	 */
	return (
		yargs
			.positional("pipeline", {
				describe: "The name of the pipeline to update",
				type: "string",
				demandOption: true,
			})
			.option("r2-bucket", {
				type: "string",
				describe: "Destination R2 bucket name",
				demandOption: false, // Not required for updates.
			})
			// Sources
			.group(
				[
					"enable-worker-binding",
					"enable-http",
					"require-http-auth",
					"cors-origins",
				],
				"Source settings:"
			)
			.option("enable-worker-binding", {
				type: "boolean",
				describe: "Send data from a Worker to a Pipeline using a Binding",
				demandOption: false,
			})
			.option("enable-http", {
				type: "boolean",
				describe: "Generate an endpoint to ingest data via HTTP",
				demandOption: false,
			})
			.option("require-http-auth", {
				type: "boolean",
				describe:
					"Require Cloudflare API Token for HTTPS endpoint authentication",
				demandOption: false,
			})
			.option("cors-origins", {
				type: "array",
				describe:
					"CORS origin allowlist for HTTP endpoint (use * for any origin)",
				demandOption: false,
				coerce: validateCorsOrigins,
			})

			// Batching
			.group(
				["batch-max-mb", "batch-max-rows", "batch-max-seconds"],
				"Batch definition:"
			)
			.option("batch-max-mb", {
				type: "number",
				describe: "Maximum batch size in megabytes before flushing",
				demandOption: false,
				coerce: validateInRange("batch-max-mb", 1, 100),
			})
			.option("batch-max-rows", {
				type: "number",
				describe: "Maximum number of rows per batch before flushing",
				demandOption: false,
				coerce: validateInRange("batch-max-rows", 100, 1000000),
			})
			.option("batch-max-seconds", {
				type: "number",
				describe: "Maximum age of batch in seconds before flushing",
				demandOption: false,
				coerce: validateInRange("batch-max-seconds", 1, 300),
			})

			// Transform options
			.group(["transform-worker"], "Transformations:")
			.option("transform-worker", {
				type: "string",
				describe:
					"PipelineTransform worker and entrypoint (<worker>.<entrypoint>)",
				demandOption: false,
			})

			// Destination options
			.group(
				[
					"r2-bucket",
					"r2-access-key-id",
					"r2-secret-access-key",
					"r2-prefix",
					"compression",
					"file-template",
					"partition-template",
				],
				"Destination settings:"
			)
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
					throw new Error(
						"--r2-access-key-id and --r2-secret-access-key must be provided together"
					);
				}
				return true;
			})
			.option("r2-prefix", {
				type: "string",
				describe: "Prefix for storing files in the destination bucket",
				demandOption: false,
			})
			.option("compression", {
				type: "string",
				describe: "Compression format for output files",
				choices: ["none", "gzip", "deflate"],
				demandOption: false,
			})
			.option("partition-template", {
				type: "string",
				describe: "Path template for partitioned files in the bucket",
				demandOption: false,
			})
			.option("file-template", {
				type: "string",
				describe: "Template for individual file names (must include ${slug})",
				demandOption: false,
				coerce: (val: string) => {
					if (!val.includes("${slug}")) {
						throw new Error("filename must contain ${slug}");
					}
					return val;
				},
			})
	);
}

export async function updatePipelineHandler(
	args: StrictYargsOptionsToInterface<typeof addUpdateOptions>
) {
	await printWranglerBanner();

	const name = args.pipeline;
	// only the fields set will be updated - other fields will use the existing config
	const config = readConfig(args);
	const accountId = await requireAuth(config);

	const pipelineConfig = await getPipeline(accountId, name);

	if (args.compression) {
		pipelineConfig.destination.compression.type = args.compression;
	}
	if (args.batchMaxMb) {
		pipelineConfig.destination.batch.max_bytes = args.batchMaxMb * BYTES_PER_MB; // convert to bytes for the API
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

	if (args.enableWorkerBinding !== undefined) {
		// strip off old source & keep if necessary
		const source = pipelineConfig.source.find(
			(s: Source) => s.type === "binding"
		);
		pipelineConfig.source = pipelineConfig.source.filter(
			(s: Source) => s.type !== "binding"
		);
		// add back only if specified
		if (args.enableWorkerBinding) {
			pipelineConfig.source.push({
				...source,
				type: "binding",
				format: "json",
			});
		}
	}

	if (args.enableHttp !== undefined) {
		// strip off old source & keep if necessary
		const source = pipelineConfig.source.find((s: Source) => s.type === "http");
		pipelineConfig.source = pipelineConfig.source.filter(
			(s: Source) => s.type !== "http"
		);
		// add back if specified
		if (args.enableHttp) {
			const update = {
				type: "http",
				format: "json",
				...source,
			} satisfies HttpSource;

			pipelineConfig.source.push(update);
		}
	}

	const httpSource = pipelineConfig.source.find(
		(s: Source) => s.type === "http"
	);
	if (httpSource) {
		if (args.requireHttpAuth) {
			httpSource.authentication = args.requireHttpAuth;
		}
		if (args.corsOrigins && args.corsOrigins.length > 0) {
			httpSource.cors = { origins: args.corsOrigins };
		}
	}

	if (args.transformWorker) {
		pipelineConfig.transforms.push(parseTransform(args.transformWorker));
	}

	if (args.r2Prefix) {
		pipelineConfig.destination.path.prefix = args.r2Prefix;
	}
	if (args.partitionTemplate) {
		pipelineConfig.destination.path.filepath = args.partitionTemplate;
	}
	if (args.fileTemplate) {
		pipelineConfig.destination.path.filename = args.fileTemplate;
	}

	logger.log(`🌀 Updating pipeline "${name}"`);
	const pipeline = await updatePipeline(accountId, name, pipelineConfig);
	metrics.sendMetricsEvent("update pipeline", {
		sendMetrics: config.send_metrics,
	});

	logger.log(
		`✅ Successfully updated pipeline "${pipeline.name}" with ID ${pipeline.id}\n`
	);
}
