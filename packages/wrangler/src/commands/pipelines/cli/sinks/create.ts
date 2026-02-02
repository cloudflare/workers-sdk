import {
	bucketFormatMessage,
	CommandLineArgsError,
	isValidR2BucketName,
	UserError,
} from "@cloudflare/workers-utils";
import { createCommand } from "../../../../core/create-command";
import { logger } from "../../../../logger";
import { requireAuth } from "../../../../user";
import { createSink } from "../../client";
import { applyDefaultsToSink, SINK_DEFAULTS } from "../../defaults";
import { authorizeR2Bucket } from "../../index";
import { validateEntityName } from "../../validate";
import { displaySinkConfiguration } from "./utils";
import type { CreateSinkRequest, SinkFormat } from "../../types";

function parseSinkType(type: string): "r2" | "r2_data_catalog" {
	if (type === "r2" || type === "r2-data-catalog") {
		return type === "r2-data-catalog" ? "r2_data_catalog" : "r2";
	}
	throw new UserError(
		`Invalid sink type: ${type}. Must be 'r2' or 'r2-data-catalog'`
	);
}

export const pipelinesSinksCreateCommand = createCommand({
	metadata: {
		description: "Create a new sink",
		owner: "Product: Pipelines",
		status: "open beta",
	},
	positionalArgs: ["sink"],
	args: {
		sink: {
			describe: "The name of the sink to create",
			type: "string",
			demandOption: true,
		},
		type: {
			describe: "The type of sink to create",
			type: "string",
			choices: ["r2", "r2-data-catalog"],
			demandOption: true,
		},
		bucket: {
			describe: "R2 bucket name",
			type: "string",
			demandOption: true,
		},
		format: {
			describe: "Output format",
			type: "string",
			choices: ["json", "parquet"],
			default: SINK_DEFAULTS.format.type,
		},
		compression: {
			describe: "Compression method (parquet only)",
			type: "string",
			choices: ["uncompressed", "snappy", "gzip", "zstd", "lz4"],
			default: SINK_DEFAULTS.format.compression,
		},
		"target-row-group-size": {
			describe: "Target row group size for parquet format",
			type: "string",
		},
		path: {
			describe: "The base prefix in your bucket where data will be written",
			type: "string",
		},
		partitioning: {
			describe: "Time partition pattern (r2 sinks only)",
			type: "string",
		},
		"roll-size": {
			describe: "Roll file size in MB",
			type: "number",
		},
		"roll-interval": {
			describe: "Roll file interval in seconds",
			type: "number",
			default: SINK_DEFAULTS.rolling_policy.interval_seconds,
		},
		"access-key-id": {
			describe:
				"R2 access key ID (leave empty for R2 credentials to be automatically created)",
			type: "string",
			implies: "secret-access-key",
		},
		"secret-access-key": {
			describe:
				"R2 secret access key (leave empty for R2 credentials to be automatically created)",
			type: "string",
			implies: "access-key-id",
		},
		namespace: {
			describe: "Data catalog namespace (required for r2-data-catalog)",
			type: "string",
		},
		table: {
			describe: "Table name within namespace (required for r2-data-catalog)",
			type: "string",
		},
		"catalog-token": {
			describe:
				"Authentication token for data catalog (required for r2-data-catalog)",
			type: "string",
		},
	},
	validateArgs: (args) => {
		validateEntityName("sink", args.sink);

		const sinkType = parseSinkType(args.type);

		if (!isValidR2BucketName(args.bucket)) {
			throw new CommandLineArgsError(
				`The bucket name "${args.bucket}" is invalid. ${bucketFormatMessage}`
			);
		}

		if (sinkType === "r2_data_catalog") {
			if (!args.namespace) {
				throw new CommandLineArgsError(
					"--namespace is required for r2-data-catalog sinks"
				);
			}
			if (!args.table) {
				throw new CommandLineArgsError(
					"--table is required for r2-data-catalog sinks"
				);
			}
			if (!args.catalogToken) {
				throw new CommandLineArgsError(
					"--catalog-token is required for r2-data-catalog sinks"
				);
			}
			if (args.format === "json") {
				throw new CommandLineArgsError(
					"r2-data-catalog sinks only support parquet format, not JSON"
				);
			}
		}
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		const sinkName = args.sink;
		const sinkType = parseSinkType(args.type);

		const sinkConfig: CreateSinkRequest = {
			name: sinkName,
			type: sinkType,
			config: {
				bucket: args.bucket,
			},
		};

		if (args.format || args.compression || args.targetRowGroupSize) {
			let formatConfig: SinkFormat;
			if (args.format === "json") {
				formatConfig = { type: "json" };
			} else {
				formatConfig = {
					type: "parquet",
					...(args.compression && {
						compression: args.compression as
							| "uncompressed"
							| "snappy"
							| "gzip"
							| "zstd"
							| "lz4",
					}),
					...(args.targetRowGroupSize && {
						row_group_bytes:
							parseInt(args.targetRowGroupSize.replace(/MB$/i, "")) *
							1024 *
							1024,
					}),
				};
			}
			sinkConfig.format = formatConfig;
		}

		if (args.path) {
			sinkConfig.config.path = args.path;
		}
		if (args.partitioning && sinkType === "r2") {
			sinkConfig.config.partitioning = {
				time_pattern: args.partitioning,
			};
		}

		if (args.rollSize || args.rollInterval) {
			let file_size_bytes: number | undefined =
				SINK_DEFAULTS.rolling_policy.file_size_bytes;
			let interval_seconds: number =
				SINK_DEFAULTS.rolling_policy.interval_seconds;

			if (args.rollSize) {
				file_size_bytes = args.rollSize * 1024 * 1024;
			}
			if (args.rollInterval) {
				interval_seconds = args.rollInterval;
			}

			sinkConfig.config.rolling_policy = {
				...(file_size_bytes !== undefined && { file_size_bytes }),
				interval_seconds,
			};
		}

		if (sinkType === "r2") {
			if (args.accessKeyId && args.secretAccessKey) {
				// Use provided credentials
				sinkConfig.config.credentials = {
					access_key_id: args.accessKeyId,
					secret_access_key: args.secretAccessKey,
				};
			} else {
				// Use OAuth flow to generate credentials
				const auth = await authorizeR2Bucket(
					config,
					sinkName,
					accountId,
					args.bucket
				);
				sinkConfig.config.credentials = {
					access_key_id: auth.accessKeyId,
					secret_access_key: auth.secretAccessKey,
				};
			}
		}

		if (sinkType === "r2_data_catalog") {
			sinkConfig.config.namespace = args.namespace;
			sinkConfig.config.table_name = args.table;
			sinkConfig.config.token = args.catalogToken;
		}

		logger.log(`🌀 Creating sink '${sinkName}'...`);

		let sink;
		try {
			sink = await createSink(config, sinkConfig);
		} catch (error) {
			// Extract user-friendly error message
			let errorMessage = "Unknown error occurred";
			if (error && typeof error === "object") {
				const errorObj = error as {
					notes?: Array<{ text?: string }>;
					message?: string;
				};
				if (
					errorObj.notes &&
					Array.isArray(errorObj.notes) &&
					errorObj.notes[0]?.text
				) {
					errorMessage = errorObj.notes[0].text;
				} else if (error instanceof Error) {
					errorMessage = error.message;
				}
			}

			throw new UserError(
				`Failed to create sink '${sinkName}': ${errorMessage}`
			);
		}

		logger.log(
			`✨ Successfully created sink '${sink.name}' with id '${sink.id}'.`
		);

		const sinkWithDefaults = applyDefaultsToSink(sink);

		displaySinkConfiguration(sinkWithDefaults, "Creation Summary", {
			includeTimestamps: false,
		});
	},
});
