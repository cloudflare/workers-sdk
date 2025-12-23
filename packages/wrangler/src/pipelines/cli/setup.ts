import { readFileSync } from "node:fs";
import {
	bucketFormatMessage,
	isValidR2BucketName,
	parseJSON,
	UserError,
} from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { confirm, prompt, select } from "../../dialogs";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import {
	createPipeline,
	createSink,
	createStream,
	deleteSink,
	deleteStream,
	validateSql,
} from "../client";
import { SINK_DEFAULTS } from "../defaults";
import { authorizeR2Bucket } from "../index";
import { validateEntityName } from "../validate";
import {
	displayUsageExamples,
	formatSchemaFieldsForTable,
} from "./streams/utils";
import type {
	CreatePipelineRequest,
	CreateSinkRequest,
	CreateStreamRequest,
	ParquetFormat,
	SchemaField,
	Sink,
	SinkFormat,
	Stream,
} from "../types";
import type { Config } from "@cloudflare/workers-utils";

interface SetupConfig {
	pipelineName: string;
	streamName: string;
	sinkName: string;
	streamConfig: CreateStreamRequest;
	sinkConfig: CreateSinkRequest;
	pipelineConfig?: CreatePipelineRequest;
}

export const pipelinesSetupCommand = createCommand({
	metadata: {
		description: "Interactive setup for a complete pipeline",
		owner: "Product: Pipelines",
		status: "open beta",
	},
	args: {
		name: {
			describe: "Pipeline name",
			type: "string",
		},
	},
	async handler(args, { config }) {
		await requireAuth(config);

		logger.log("🚀 Welcome to Cloudflare Pipelines Setup!");
		logger.log(
			"This will guide you through creating a complete pipeline: stream → pipeline → sink\n"
		);

		try {
			const setupConfig = await setupPipelineNaming(args.name);

			await setupStreamConfiguration(setupConfig);
			await setupSinkConfiguration(config, setupConfig);
			const created = await reviewAndCreateStreamSink(config, setupConfig);
			await setupSQLTransformationWithValidation(config, setupConfig, created);
			await createPipelineIfNeeded(config, setupConfig, created, args);
		} catch (error) {
			if (error instanceof UserError) {
				throw error;
			}
			throw new UserError(
				`Setup failed: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	},
});

async function setupPipelineNaming(
	providedName?: string
): Promise<SetupConfig> {
	const pipelineName =
		providedName ||
		(await prompt("What would you like to name your pipeline?"));

	if (!pipelineName) {
		throw new UserError("Pipeline name is required");
	}

	validateEntityName("pipeline", pipelineName);

	const streamName = `${pipelineName}_stream`;
	const sinkName = `${pipelineName}_sink`;

	return {
		pipelineName,
		streamName,
		sinkName,
		streamConfig: {
			name: streamName,
			http: { enabled: true, authentication: false },
			worker_binding: { enabled: true },
		},
		sinkConfig: {
			name: sinkName,
			type: "r2",
			config: { bucket: "" },
		},
	};
}

async function setupStreamConfiguration(
	setupConfig: SetupConfig
): Promise<void> {
	logger.log("\n▶ Let's configure your data source (stream):");

	const httpEnabled = await confirm("Enable HTTP endpoint for sending data?", {
		defaultValue: true,
	});

	let httpAuth = false;
	if (httpEnabled) {
		httpAuth = await confirm("Require authentication for HTTP endpoint?", {
			defaultValue: false,
		});
	}

	let corsOrigins: string[] | undefined;
	if (httpEnabled) {
		const customCors = await confirm("Configure custom CORS origins?", {
			defaultValue: false,
		});
		if (customCors) {
			const origins = await prompt(
				"CORS origins (comma-separated, or * for all):"
			);
			corsOrigins =
				origins === "*" ? ["*"] : origins.split(",").map((o) => o.trim());
		}
	}

	const schema = await setupSchemaConfiguration();

	setupConfig.streamConfig = {
		name: setupConfig.streamName,
		format: { type: "json" as const, ...(!schema && { unstructured: true }) },
		http: {
			enabled: httpEnabled,
			authentication: httpAuth,
			...(httpEnabled && corsOrigins && { cors: { origins: corsOrigins } }),
		},
		worker_binding: { enabled: true },
		...(schema && { schema: { fields: schema } }),
	};

	logger.log("✨ Stream configuration complete\n");
}

async function setupSchemaConfiguration(): Promise<SchemaField[] | undefined> {
	const schemaMethod = await select(
		"How would you like to define the schema?",
		{
			choices: [
				{ title: "Build interactively", value: "interactive" },
				{ title: "Load from file", value: "file" },
				{ title: "Skip (unstructured)", value: "skip" },
			],
			defaultOption: 0,
			fallbackOption: 2,
		}
	);

	switch (schemaMethod) {
		case "interactive":
			return buildSchemaInteractively();
		case "file":
			return loadSchemaFromFile();
		case "skip":
			return undefined;
		default:
			return undefined;
	}
}

async function buildSchemaInteractively(): Promise<SchemaField[]> {
	const fields: SchemaField[] = [];
	let fieldNumber = 1;

	logger.log("\n▶ Building schema interactively:");

	let continueAdding = true;
	while (continueAdding) {
		const field = await buildField(fieldNumber);
		fields.push(field);

		const addAnother = await confirm(`Add field #${fieldNumber + 1}?`, {
			defaultValue: fieldNumber < 3,
		});

		if (!addAnother) {
			continueAdding = false;
		} else {
			fieldNumber++;
		}
	}

	return fields;
}

async function buildField(
	fieldNumber: number,
	depth = 0
): Promise<SchemaField> {
	const indent = "  ".repeat(depth);
	logger.log(`${indent}Field #${fieldNumber}:`);

	const name = await prompt(`${indent}  Name:`);

	if (!name) {
		throw new UserError("Field name is required");
	}

	const typeChoices = [
		{ title: "string", value: "string" },
		{ title: "int32", value: "int32" },
		{ title: "int64", value: "int64" },
		{ title: "float32", value: "float32" },
		{ title: "float64", value: "float64" },
		{ title: "bool", value: "bool" },
		{ title: "timestamp", value: "timestamp" },
		{ title: "json", value: "json" },
		{ title: "bytes", value: "bytes" },
	];

	// Only show complex types if not nested too deep
	if (depth < 2) {
		typeChoices.push(
			{ title: "struct (nested object)", value: "struct" },
			{ title: "list (array)", value: "list" }
		);
	}

	const type = await select(`${indent}  Type:`, {
		choices: typeChoices,
		defaultOption: 0,
		fallbackOption: 0,
	});

	const required = await confirm(`${indent}  Required?`, {
		defaultValue: true,
	});

	const field: SchemaField = {
		name,
		type: type as SchemaField["type"],
		required,
	};

	// Handle type-specific configuration
	if (type === "timestamp") {
		const unit = await select(`${indent}  Unit:`, {
			choices: [
				{ title: "millisecond", value: "millisecond" },
				{ title: "second", value: "second" },
				{ title: "microsecond", value: "microsecond" },
				{ title: "nanosecond", value: "nanosecond" },
			],
			defaultOption: 0,
			fallbackOption: 0,
		});
		field.unit = unit;
	} else if (type === "struct" && depth < 2) {
		logger.log(`\nDefine nested fields for struct '${name}':`);
		field.fields = [];
		let structFieldNumber = 1;

		let continueAdding = true;
		while (continueAdding) {
			const structField = await buildField(structFieldNumber, depth + 1);
			field.fields.push(structField);

			const addAnother = await confirm(
				`${indent}Add another field to struct '${name}'?`,
				{ defaultValue: false }
			);

			if (!addAnother) {
				continueAdding = false;
			} else {
				structFieldNumber++;
			}
		}
	} else if (type === "list" && depth < 2) {
		logger.log(`\nDefine item type for list '${name}':`);
		field.items = await buildField(1, depth + 1);
	}

	return field;
}

async function loadSchemaFromFile(): Promise<SchemaField[]> {
	const filePath = await prompt("Schema file path:");

	try {
		const schemaContent = readFileSync(filePath, "utf-8");
		const parsedSchema = parseJSON(schemaContent, filePath) as {
			fields: SchemaField[];
		};

		if (!parsedSchema || !Array.isArray(parsedSchema.fields)) {
			throw new UserError("Schema file must contain a 'fields' array");
		}

		return parsedSchema.fields;
	} catch (error) {
		logger.error(
			`Failed to read schema file: ${error instanceof Error ? error.message : String(error)}`
		);

		const retry = await confirm("Would you like to try again?", {
			defaultValue: true,
		});

		if (retry) {
			return loadSchemaFromFile();
		} else {
			throw new UserError("Schema file loading cancelled");
		}
	}
}

async function setupSinkConfiguration(
	config: Config,
	setupConfig: SetupConfig
): Promise<void> {
	logger.log("▶ Let's configure your destination (sink):");

	const sinkType = await select("Select destination type:", {
		choices: [
			{ title: "R2 Bucket", value: "r2" },
			{ title: "Data Catalog Table", value: "r2_data_catalog" },
		],
		defaultOption: 0,
		fallbackOption: 0,
	});

	const accountId = await requireAuth(config);

	if (sinkType === "r2") {
		await setupR2Sink(config, accountId, setupConfig);
	} else {
		await setupDataCatalogSink(setupConfig);
	}

	logger.log("✨ Sink configuration complete\n");
}

async function setupR2Sink(
	config: Config,
	accountId: string,
	setupConfig: SetupConfig
): Promise<void> {
	const bucket = await prompt("R2 bucket name:");

	if (!bucket) {
		throw new UserError("Bucket name is required");
	}

	if (!isValidR2BucketName(bucket)) {
		throw new UserError(
			`The bucket name "${bucket}" is invalid. ${bucketFormatMessage}`
		);
	}

	const path = await prompt(
		"The base prefix in your bucket where data will be written (optional):",
		{
			defaultValue: "",
		}
	);

	const timePartitionPattern = await prompt(
		"Time partition pattern (optional):",
		{
			defaultValue: "year=%Y/month=%m/day=%d",
		}
	);

	const format = await select("Output format:", {
		choices: [
			{ title: "Parquet (recommended for analytics)", value: "parquet" },
			{ title: "JSON", value: "json" },
		],
		defaultOption: 0,
		fallbackOption: 0,
	});

	let compression;
	if (format === "parquet") {
		compression = await select("Compression:", {
			choices: [
				{ title: "uncompressed", value: "uncompressed" },
				{ title: "snappy", value: "snappy" },
				{ title: "gzip", value: "gzip" },
				{ title: "zstd", value: "zstd" },
				{ title: "lz4", value: "lz4" },
			],
			defaultOption: 3,
			fallbackOption: 3,
		});
	}

	const fileSizeMB = await prompt(
		"Roll file when size reaches (MB, minimum 5):",
		{
			defaultValue: "100",
		}
	);
	const intervalSeconds = await prompt(
		"Roll file when time reaches (seconds, minimum 10):",
		{
			defaultValue: String(SINK_DEFAULTS.rolling_policy.interval_seconds),
		}
	);

	const useOAuth = await confirm(
		"Automatically generate credentials needed to write to your R2 bucket?",
		{
			defaultValue: true,
		}
	);

	let credentials;
	if (useOAuth) {
		logger.log("🔐 Generating R2 credentials...");
		// Clean up sink name for service token generation (remove underscores)
		const cleanedSinkName = setupConfig.sinkName.replace(/_/g, "-");
		const auth = await authorizeR2Bucket(
			config,
			cleanedSinkName,
			accountId,
			bucket
		);
		credentials = {
			access_key_id: auth.accessKeyId,
			secret_access_key: auth.secretAccessKey,
		};
	} else {
		credentials = {
			access_key_id: await prompt("R2 Access Key ID:"),
			secret_access_key: await prompt("R2 Secret Access Key:", {
				isSecret: true,
			}),
		};
	}

	let formatConfig: SinkFormat;
	if (format === "json") {
		formatConfig = { type: "json" };
	} else {
		formatConfig = {
			type: "parquet",
			...(compression && {
				compression: compression as ParquetFormat["compression"],
			}),
		};
	}

	setupConfig.sinkConfig = {
		name: setupConfig.sinkName,
		type: "r2",
		format: formatConfig,
		config: {
			bucket,
			...(path && { path }),
			...(timePartitionPattern && {
				partitioning: {
					time_pattern: timePartitionPattern,
				},
			}),
			credentials,
			rolling_policy: {
				file_size_bytes: parseInt(fileSizeMB) * 1024 * 1024, // Convert MB to bytes
				interval_seconds: parseInt(intervalSeconds),
			},
		},
	};
}

async function setupDataCatalogSink(setupConfig: SetupConfig): Promise<void> {
	const bucket = await prompt("R2 bucket name (for catalog storage):");
	const namespace = await prompt("Namespace:", { defaultValue: "default" });
	const tableName = await prompt("Table name:");
	const token = await prompt("Catalog API token:", { isSecret: true });

	if (!bucket || !namespace || !tableName || !token) {
		throw new UserError("All Data Catalog fields are required");
	}

	const compression = await select("Compression:", {
		choices: [
			{ title: "uncompressed", value: "uncompressed" },
			{ title: "snappy", value: "snappy" },
			{ title: "gzip", value: "gzip" },
			{ title: "zstd", value: "zstd" },
			{ title: "lz4", value: "lz4" },
		],
		defaultOption: 3,
		fallbackOption: 3,
	});

	const fileSizeMB = await prompt(
		"Roll file when size reaches (MB, minimum 5):",
		{
			defaultValue: "100",
		}
	);
	const intervalSeconds = await prompt(
		"Roll file when time reaches (seconds, minimum 10):",
		{
			defaultValue: String(SINK_DEFAULTS.rolling_policy.interval_seconds),
		}
	);

	setupConfig.sinkConfig = {
		name: setupConfig.sinkName,
		type: "r2_data_catalog",
		format: {
			type: "parquet",
			compression: compression as ParquetFormat["compression"],
		},
		config: {
			bucket,
			namespace,
			table_name: tableName,
			token,
			rolling_policy: {
				file_size_bytes: parseInt(fileSizeMB) * 1024 * 1024,
				interval_seconds: parseInt(intervalSeconds),
			},
		},
	};
}

async function setupSQLTransformationWithValidation(
	config: Config,
	setupConfig: SetupConfig,
	created: { stream?: Stream; sink?: Sink }
): Promise<void> {
	logger.log("\n▶ Pipeline SQL:");

	logger.log("\nAvailable tables:");
	logger.log(`  • ${setupConfig.streamName} (source stream)`);
	logger.log(`  • ${setupConfig.sinkName} (destination sink)`);

	if (setupConfig.streamConfig.schema?.fields) {
		logger.log("\nStream input schema:");
		const schemaRows = formatSchemaFieldsForTable(
			setupConfig.streamConfig.schema.fields
		);
		logger.table(schemaRows);
	}

	const sqlMethod = await select(
		"How would you like to provide SQL that will define how your pipeline will transform and route data?",
		{
			choices: [
				{
					title:
						"Use simple ingestion query (copy all data from stream to sink)",
					value: "simple",
				},
				{ title: "Write interactively", value: "interactive" },
				{ title: "Load from file", value: "file" },
			],
			defaultOption: 0,
			fallbackOption: 0,
		}
	);

	let sql: string;

	if (sqlMethod === "simple") {
		sql = `INSERT INTO ${setupConfig.sinkName} SELECT * FROM ${setupConfig.streamName};`;
		logger.log(`\nUsing query: ${sql}`);
	} else if (sqlMethod === "interactive") {
		logger.log(
			`\n💡 Example: INSERT INTO ${setupConfig.sinkName} SELECT * FROM ${setupConfig.streamName};`
		);

		sql = await promptMultiline("Enter SQL query:", "SQL");
	} else {
		const filePath = await prompt("SQL file path:");
		try {
			sql = readFileSync(filePath, "utf-8").trim();
		} catch (error) {
			throw new UserError(
				`Failed to read SQL file: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	if (!sql) {
		throw new UserError("SQL query cannot be empty");
	}

	logger.log("🌀 Validating SQL...");
	try {
		const validationResult = await validateSql(config, { sql });

		if (
			!validationResult.tables ||
			Object.keys(validationResult.tables).length === 0
		) {
			logger.warn(
				"SQL validation returned no tables - this might indicate an issue with the query"
			);
		} else {
			const tableNames = Object.keys(validationResult.tables);
			logger.log(
				`✨ SQL validation passed. References tables: ${tableNames.join(", ")}`
			);
		}

		setupConfig.pipelineConfig = {
			name: setupConfig.pipelineName,
			sql,
		};
	} catch (error) {
		let errorMessage = "SQL validation failed";

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
			}
		}

		const retry = await confirm(
			`SQL validation failed: ${errorMessage}\n\nRetry with different SQL?`,
			{ defaultValue: true }
		);

		if (retry) {
			return setupSQLTransformationWithValidation(config, setupConfig, created);
		} else {
			throw new UserError(
				"SQL validation failed and setup cannot continue without valid pipeline SQL"
			);
		}
	}

	logger.log("✨ SQL configuration complete\n");
}

async function promptMultiline(
	message: string,
	promptPrefix: string = "INPUT"
): Promise<string> {
	logger.log(message);
	logger.log("(Press Enter to finish each line, empty line to complete)\n");

	const lines: string[] = [];
	let line: string;

	do {
		line = await prompt(lines.length === 0 ? `${promptPrefix}> ` : `...> `);
		if (line.trim()) {
			lines.push(line);
		}
	} while (line.trim() !== "");

	return lines.join(" ");
}

async function reviewAndCreateStreamSink(
	config: Config,
	setupConfig: SetupConfig
): Promise<{ stream?: Stream; sink?: Sink }> {
	// Display summary
	logger.log("▶ Configuration Summary:");
	logger.log(`\nStream: ${setupConfig.streamName}`);
	logger.log(
		`  • HTTP: ${setupConfig.streamConfig.http.enabled ? "Enabled" : "Disabled"}`
	);
	if (setupConfig.streamConfig.http.enabled) {
		logger.log(
			`  • Authentication: ${setupConfig.streamConfig.http.authentication ? "Required" : "None"}`
		);
	}
	logger.log(
		`  • Schema: ${setupConfig.streamConfig.schema?.fields ? `${setupConfig.streamConfig.schema.fields.length} fields` : "Unstructured"}`
	);

	logger.log(`\nSink: ${setupConfig.sinkName}`);
	logger.log(
		`  • Type: ${setupConfig.sinkConfig.type === "r2" ? "R2 Bucket" : "Data Catalog"}`
	);
	if (setupConfig.sinkConfig.type === "r2") {
		logger.log(`  • Bucket: ${setupConfig.sinkConfig.config.bucket}`);
		logger.log(
			`  • Format: ${setupConfig.sinkConfig.format?.type || "parquet"}`
		);
	} else {
		logger.log(
			`  • Table: ${setupConfig.sinkConfig.config.namespace}/${setupConfig.sinkConfig.config.table_name}`
		);
	}

	const proceed = await confirm("Create stream and sink?", {
		defaultValue: true,
	});

	if (!proceed) {
		throw new UserError("Setup cancelled");
	}

	// Create resources with rollback on failure
	const created: { stream?: Stream; sink?: Sink } = {};

	try {
		// Create stream
		logger.log("\n🌀 Creating stream...");
		created.stream = await createStream(config, setupConfig.streamConfig);
		logger.log(`✨ Created stream: ${created.stream.name}`);

		// Create sink
		logger.log("🌀 Creating sink...");
		created.sink = await createSink(config, setupConfig.sinkConfig);
		logger.log(`✨ Created sink: ${created.sink.name}`);

		logger.log("\n✨ Stream and sink created successfully!");
		return created;
	} catch (error) {
		logger.error(
			`❌ Setup failed: ${error instanceof Error ? error.message : String(error)}`
		);

		logger.log("🌀 Rolling back created resources...");

		if (created.stream) {
			try {
				await deleteStream(config, created.stream.id);
				logger.log(`✨ Cleaned up stream: ${created.stream.name}`);
			} catch (cleanupError) {
				logger.warn(
					`Failed to cleanup stream: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
				);
			}
		}

		if (created.sink) {
			try {
				await deleteSink(config, created.sink.id);
				logger.log(`✨ Cleaned up sink: ${created.sink.name}`);
			} catch (cleanupError) {
				logger.warn(
					`Failed to cleanup sink: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
				);
			}
		}

		throw error;
	}
}

async function createPipelineIfNeeded(
	config: Config,
	setupConfig: SetupConfig,
	created: { stream?: Stream; sink?: Sink },
	args: { env?: string }
): Promise<void> {
	if (!setupConfig.pipelineConfig) {
		throw new UserError("Pipeline configuration is missing");
	}

	try {
		logger.log("🌀 Creating pipeline...");
		const pipeline = await createPipeline(config, setupConfig.pipelineConfig);
		logger.log(`✨ Created pipeline: ${pipeline.name}`);

		logger.log("\n✨ Setup complete!");

		if (created.stream) {
			await displayUsageExamples(created.stream, config, args);
		}
	} catch (error) {
		logger.error(
			`❌ Pipeline creation failed: ${error instanceof Error ? error.message : String(error)}`
		);
		logger.log(
			"\n⚠️  Stream and sink were created successfully, but pipeline creation failed."
		);
		logger.log(
			"You can try creating the pipeline manually with: wrangler pipelines create"
		);
		throw error;
	}
}
