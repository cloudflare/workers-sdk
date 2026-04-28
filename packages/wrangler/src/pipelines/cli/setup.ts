import { readFileSync } from "node:fs";
import {
	APIError,
	bucketFormatMessage,
	isValidR2BucketName,
	parseJSON,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { createCommand } from "../../core/create-command";
import { confirm, prompt, select } from "../../dialogs";
import { logger } from "../../logger";
import { createR2Bucket, getR2Bucket } from "../../r2/helpers/bucket";
import {
	enableR2Catalog,
	getR2Catalog,
	upsertR2CatalogCredential,
} from "../../r2/helpers/catalog";
import { requireAuth } from "../../user";
import {
	createPipeline,
	createSink,
	createStream,
	deleteStream,
	validateSql,
} from "../client";
import { SINK_DEFAULTS } from "../defaults";
import { authorizeR2Bucket, verifyR2Credentials } from "../index";
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

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof APIError && error.notes.length > 0) {
		return error.notes[0].text;
	}
	if (error instanceof Error) {
		return error.message;
	}
	return fallback;
}

async function promptWithRetry<T>(
	getMessage: () => string,
	getValue: () => Promise<T>,
	validate: (value: T) => void
): Promise<T> {
	while (true) {
		const value = await getValue();
		try {
			validate(value);
			return value;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Validation failed";
			logger.error(message);

			const retry = await confirm("Would you like to try again?", {
				defaultValue: true,
			});
			if (!retry) {
				throw new UserError(`${getMessage()} - cancelled`);
			}
		}
	}
}

async function ensureBucketExists(
	config: Config,
	accountId: string,
	bucketName: string
): Promise<boolean> {
	try {
		await getR2Bucket(config, accountId, bucketName);
		logger.log(`  Using existing bucket "${bucketName}"`);
		return false;
	} catch (err) {
		if (err instanceof APIError && err.code === 10006) {
			// Bucket doesn't exist, create it
		} else {
			throw err;
		}
	}

	process.stdout.write(`  Creating bucket "${bucketName}"...`);
	await createR2Bucket(config, accountId, bucketName);
	logger.log(chalk.green(" done"));
	return true;
}

function validateBucketName(name: string): void {
	if (!name) {
		throw new UserError("Bucket name is required");
	}
	if (!isValidR2BucketName(name)) {
		throw new UserError(
			`The bucket name "${name}" is invalid. ${bucketFormatMessage}`
		);
	}
}

async function promptBucketName(): Promise<string> {
	return promptWithRetry(
		() => "R2 bucket name",
		() => prompt("R2 bucket name (will be created if it doesn't exist):"),
		validateBucketName
	);
}

async function ensureCatalogEnabled(
	config: Config,
	accountId: string,
	bucketName: string
): Promise<void> {
	let catalogEnabled = false;
	try {
		const catalog = await getR2Catalog(config, accountId, bucketName);
		catalogEnabled = catalog.status === "active";
	} catch (err) {
		if (err instanceof APIError && err.code === 40401) {
			// Catalog not enabled yet
		} else {
			throw err;
		}
	}

	if (catalogEnabled) {
		logger.log("  Data Catalog already enabled");
	} else {
		process.stdout.write("  Enabling Data Catalog...");
		await enableR2Catalog(config, accountId, bucketName);
		logger.log(chalk.green(" done"));
	}
}

function displayCatalogTokenInstructions(accountId: string): void {
	logger.log(chalk.dim("\n  To create a Catalog API token:"));
	logger.log(
		chalk.dim(
			`  Visit https://dash.cloudflare.com/${accountId}/r2/api-tokens/create?type=account`
		)
	);
	logger.log(
		chalk.dim('  Create token with "Admin Read & Write" permissions\n')
	);
}

function displayR2CredentialsInstructions(accountId: string): void {
	logger.log(chalk.dim("\n  To create R2 API credentials:"));
	logger.log(
		chalk.dim(
			`  Visit https://dash.cloudflare.com/${accountId}/r2/api-tokens/create?type=account`
		)
	);
	logger.log(
		chalk.dim('  Create token with "Object Read & Write" permissions\n')
	);
}

const COMPRESSION_CHOICES = [
	{ title: "uncompressed", value: "uncompressed" },
	{ title: "snappy", value: "snappy" },
	{ title: "gzip", value: "gzip" },
	{ title: "zstd", value: "zstd" },
	{ title: "lz4", value: "lz4" },
] as const;

async function promptCompression(): Promise<string> {
	return select("Compression:", {
		choices: [...COMPRESSION_CHOICES],
		defaultOption: 3, // zstd
		fallbackOption: 3,
	});
}

async function promptRollingPolicy(): Promise<{
	fileSizeBytes: number;
	intervalSeconds: number;
}> {
	const fileSizeMB = await promptWithRetry(
		() => "File size",
		() =>
			prompt("Roll file when size reaches (MB, minimum 5):", {
				defaultValue: "100",
			}),
		(value) => {
			const num = parseInt(value, 10);
			if (isNaN(num) || num < 5) {
				throw new UserError("File size must be a number >= 5");
			}
		}
	);

	const intervalSeconds = await promptWithRetry(
		() => "Interval",
		() =>
			prompt("Roll file when time reaches (seconds, minimum 10):", {
				defaultValue: String(SINK_DEFAULTS.rolling_policy.interval_seconds),
			}),
		(value) => {
			const num = parseInt(value, 10);
			if (isNaN(num) || num < 10) {
				throw new UserError("Interval must be a number >= 10");
			}
		}
	);

	return {
		fileSizeBytes: parseInt(fileSizeMB) * 1024 * 1024,
		intervalSeconds: parseInt(intervalSeconds),
	};
}

async function promptCatalogToken(
	config: Config,
	accountId: string,
	bucketName: string
): Promise<string> {
	while (true) {
		const token = await prompt("Catalog API token:", { isSecret: true });

		if (!token) {
			logger.error("Catalog API token is required");
			const retry = await confirm("Would you like to try again?", {
				defaultValue: true,
			});
			if (!retry) {
				throw new UserError("Catalog API token - cancelled");
			}
			continue;
		}

		process.stdout.write("  Validating token...");
		try {
			await upsertR2CatalogCredential(config, accountId, bucketName, token);
			logger.log(chalk.green(" done"));
			return token;
		} catch {
			logger.log(chalk.red(" failed"));
			logger.log(
				chalk.dim(
					'  Token invalid or missing permissions. Ensure it has "Admin Read & Write" access.'
				)
			);

			const retry = await confirm("Would you like to try again?", {
				defaultValue: true,
			});
			if (!retry) {
				throw new UserError("Catalog API token validation failed");
			}
		}
	}
}

async function promptR2Credentials(
	accountId: string,
	bucketName: string
): Promise<{ access_key_id: string; secret_access_key: string }> {
	while (true) {
		const accessKeyId = await prompt("R2 Access Key ID:");
		if (!accessKeyId) {
			logger.error("R2 Access Key ID is required");
			const retry = await confirm("Would you like to try again?", {
				defaultValue: true,
			});
			if (!retry) {
				throw new UserError("R2 Access Key ID - cancelled");
			}
			continue;
		}

		const secretAccessKey = await prompt("R2 Secret Access Key:", {
			isSecret: true,
		});
		if (!secretAccessKey) {
			logger.error("R2 Secret Access Key is required");
			const retry = await confirm("Would you like to try again?", {
				defaultValue: true,
			});
			if (!retry) {
				throw new UserError("R2 Secret Access Key - cancelled");
			}
			continue;
		}

		process.stdout.write("  Validating credentials...");
		try {
			await verifyR2Credentials(
				accountId,
				bucketName,
				accessKeyId,
				secretAccessKey
			);
			logger.log(chalk.green(" done"));
			return {
				access_key_id: accessKeyId,
				secret_access_key: secretAccessKey,
			};
		} catch {
			logger.log(chalk.red(" failed"));
			logger.log(
				chalk.dim(
					'  Credentials invalid or missing permissions. Ensure token has "Object Read & Write" access.'
				)
			);

			const retry = await confirm("Would you like to try again?", {
				defaultValue: true,
			});
			if (!retry) {
				throw new UserError("R2 credentials validation failed");
			}
		}
	}
}

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

		logger.log("Cloudflare Pipelines Setup\n");

		try {
			const setupConfig = await setupPipelineNaming(args.name);

			await setupStreamConfiguration(setupConfig);
			await setupSinkConfiguration(config, setupConfig);
			const created = await reviewAndCreateStreamSink(config, setupConfig);
			await setupSQLTransformationWithValidation(config, setupConfig);
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
	const pipelineName = providedName
		? providedName
		: await promptWithRetry(
				() => "Pipeline name",
				() => prompt("What would you like to name your pipeline?"),
				(name) => {
					if (!name) {
						throw new UserError("Pipeline name is required");
					}
					validateEntityName("pipeline", name);
				}
			);

	// If name was provided via args, still validate it (but no retry)
	if (providedName) {
		validateEntityName("pipeline", providedName);
	}

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
	logger.log("\nSTREAM\n");

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
}

async function setupSchemaConfiguration(): Promise<SchemaField[] | undefined> {
	const schemaMethod = await select(
		"How would you like to define the schema for incoming events?",
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

	logger.log("");

	let fieldNumber = 1;
	while (true) {
		fields.push(await buildField(fieldNumber));

		const addAnother = await confirm(`Add field #${fieldNumber + 1}?`, {
			defaultValue: fieldNumber < 3,
		});
		if (!addAnother) {
			break;
		}
		fieldNumber++;
	}

	return fields;
}

async function buildField(
	fieldNumber: number,
	depth = 0
): Promise<SchemaField> {
	const indent = "  ".repeat(depth);
	logger.log(`${indent}Field #${fieldNumber}:`);

	const name = await promptWithRetry(
		() => "Field name",
		() => prompt(`${indent}  Name:`),
		(value) => {
			if (!value) {
				throw new UserError("Field name is required");
			}
		}
	);

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
		while (true) {
			field.fields.push(await buildField(structFieldNumber, depth + 1));

			const addAnother = await confirm(
				`${indent}Add another field to struct '${name}'?`,
				{ defaultValue: false }
			);
			if (!addAnother) {
				break;
			}
			structFieldNumber++;
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

async function loadSqlFromFile(): Promise<string> {
	const filePath = await prompt("SQL file path:");

	try {
		const sql = readFileSync(filePath, "utf-8").trim();

		if (!sql) {
			throw new UserError("SQL file is empty");
		}

		return sql;
	} catch (error) {
		logger.error(
			`Failed to read SQL file: ${error instanceof Error ? error.message : String(error)}`
		);

		const retry = await confirm("Would you like to try again?", {
			defaultValue: true,
		});

		if (retry) {
			return loadSqlFromFile();
		} else {
			throw new UserError("SQL file loading cancelled");
		}
	}
}

async function setupSinkConfiguration(
	config: Config,
	setupConfig: SetupConfig
): Promise<void> {
	logger.log("\nSINK\n");

	const sinkType = await select("Destination type:", {
		choices: [
			{ title: "R2 Bucket", value: "r2" },
			{ title: "Data Catalog (Iceberg)", value: "r2_data_catalog" },
		],
		defaultOption: 0,
		fallbackOption: 0,
	});

	const simpleDescription =
		sinkType === "r2"
			? "parquet + zstd, 100MB file rolls, auto-generated credentials"
			: "parquet + zstd, 100MB file rolls";

	const setupMode = await select("Setup mode:", {
		choices: [
			{
				title: "Simple (recommended defaults)",
				description: simpleDescription,
				value: "simple",
			},
			{
				title: "Advanced (configure all options)",
				description: "format, compression, rolling policy, credentials, etc.",
				value: "advanced",
			},
		],
		defaultOption: 0,
		fallbackOption: 0,
	});

	const accountId = await requireAuth(config);

	if (setupMode === "simple") {
		if (sinkType === "r2") {
			await setupSimpleR2Sink(config, accountId, setupConfig);
		} else {
			await setupSimpleDataCatalogSink(config, accountId, setupConfig);
		}
	} else {
		if (sinkType === "r2") {
			await setupR2Sink(config, accountId, setupConfig);
		} else {
			await setupDataCatalogSink(config, accountId, setupConfig);
		}
	}
}

async function setupSimpleR2Sink(
	config: Config,
	accountId: string,
	setupConfig: SetupConfig
): Promise<void> {
	const bucket = await promptBucketName();
	await ensureBucketExists(config, accountId, bucket);

	process.stdout.write("  Generating credentials...");
	const cleanedSinkName = setupConfig.sinkName.replace(/_/g, "-");
	const auth = await authorizeR2Bucket(
		config,
		cleanedSinkName,
		accountId,
		bucket,
		{ quiet: true }
	);
	logger.log(chalk.green(" done"));

	setupConfig.sinkConfig = {
		name: setupConfig.sinkName,
		type: "r2",
		format: {
			type: "parquet",
			compression: "zstd",
		},
		config: {
			bucket,
			partitioning: {
				time_pattern: "year=%Y/month=%m/day=%d",
			},
			credentials: {
				access_key_id: auth.accessKeyId,
				secret_access_key: auth.secretAccessKey,
			},
			rolling_policy: {
				file_size_bytes: 100 * 1024 * 1024,
				interval_seconds: SINK_DEFAULTS.rolling_policy.interval_seconds,
			},
		},
	};
}

async function setupSimpleDataCatalogSink(
	config: Config,
	accountId: string,
	setupConfig: SetupConfig
): Promise<void> {
	const bucket = await promptBucketName();
	await ensureBucketExists(config, accountId, bucket);
	await ensureCatalogEnabled(config, accountId, bucket);

	const tableName = await promptWithRetry(
		() => "Table name",
		() => prompt("Table name (e.g. events, user_activity):"),
		(value) => {
			if (!value) {
				throw new UserError("Table name is required");
			}
		}
	);

	displayCatalogTokenInstructions(accountId);
	const token = await promptCatalogToken(config, accountId, bucket);

	setupConfig.sinkConfig = {
		name: setupConfig.sinkName,
		type: "r2_data_catalog",
		format: {
			type: "parquet",
			compression: "zstd",
		},
		config: {
			bucket,
			namespace: "default",
			table_name: tableName,
			token,
			rolling_policy: {
				file_size_bytes: 100 * 1024 * 1024,
				interval_seconds: SINK_DEFAULTS.rolling_policy.interval_seconds,
			},
		},
	};
}

async function setupR2Sink(
	config: Config,
	accountId: string,
	setupConfig: SetupConfig
): Promise<void> {
	const bucket = await promptBucketName();
	await ensureBucketExists(config, accountId, bucket);

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

	const compression =
		format === "parquet" ? await promptCompression() : undefined;
	const rollingPolicy = await promptRollingPolicy();

	const useOAuth = await confirm(
		"Automatically generate credentials needed to write to your R2 bucket?",
		{
			defaultValue: true,
		}
	);

	let credentials;
	if (useOAuth) {
		process.stdout.write("  Generating credentials...");
		const cleanedSinkName = setupConfig.sinkName.replace(/_/g, "-");
		const auth = await authorizeR2Bucket(
			config,
			cleanedSinkName,
			accountId,
			bucket,
			{ quiet: true }
		);
		logger.log(chalk.green(" done"));
		credentials = {
			access_key_id: auth.accessKeyId,
			secret_access_key: auth.secretAccessKey,
		};
	} else {
		displayR2CredentialsInstructions(accountId);
		credentials = await promptR2Credentials(accountId, bucket);
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
				file_size_bytes: rollingPolicy.fileSizeBytes,
				interval_seconds: rollingPolicy.intervalSeconds,
			},
		},
	};
}

async function setupDataCatalogSink(
	config: Config,
	accountId: string,
	setupConfig: SetupConfig
): Promise<void> {
	const bucket = await promptBucketName();
	await ensureBucketExists(config, accountId, bucket);
	await ensureCatalogEnabled(config, accountId, bucket);

	const namespace = await promptWithRetry(
		() => "Namespace",
		() => prompt("Namespace:", { defaultValue: "default" }),
		(value) => {
			if (!value) {
				throw new UserError("Namespace is required");
			}
		}
	);

	const tableName = await promptWithRetry(
		() => "Table name",
		() => prompt("Table name:"),
		(value) => {
			if (!value) {
				throw new UserError("Table name is required");
			}
		}
	);

	displayCatalogTokenInstructions(accountId);
	const token = await promptCatalogToken(config, accountId, bucket);

	const compression = await promptCompression();
	const rollingPolicy = await promptRollingPolicy();

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
				file_size_bytes: rollingPolicy.fileSizeBytes,
				interval_seconds: rollingPolicy.intervalSeconds,
			},
		},
	};
}

async function setupSQLTransformationWithValidation(
	config: Config,
	setupConfig: SetupConfig
): Promise<void> {
	logger.log("\nSQL\n");

	logger.log("  Available tables:");
	logger.log(`    ${setupConfig.streamName} (source)`);
	logger.log(`    ${setupConfig.sinkName} (sink)\n`);

	if (setupConfig.streamConfig.schema?.fields) {
		logger.log("  Schema:");
		const schemaRows = formatSchemaFieldsForTable(
			setupConfig.streamConfig.schema.fields
		);
		logger.table(schemaRows);
	}

	const sqlMethod = await select("Query:", {
		choices: [
			{
				title: "Simple ingestion (SELECT * FROM stream)",
				value: "simple",
			},
			{ title: "Write custom SQL", value: "interactive" },
			{ title: "Load from file", value: "file" },
		],
		defaultOption: 0,
		fallbackOption: 0,
	});

	let sql: string;

	if (sqlMethod === "simple") {
		sql = `INSERT INTO ${setupConfig.sinkName} SELECT * FROM ${setupConfig.streamName};`;
		logger.log(chalk.dim(`\n  ${sql}\n`));
	} else if (sqlMethod === "interactive") {
		logger.log(
			chalk.dim(
				`\n  Example: INSERT INTO ${setupConfig.sinkName} SELECT * FROM ${setupConfig.streamName};\n`
			)
		);

		sql = await promptMultiline("Enter SQL query:", "SQL");
	} else {
		sql = await loadSqlFromFile();
	}

	if (!sql) {
		throw new UserError("SQL query cannot be empty");
	}

	process.stdout.write("  Validating...");
	try {
		const validationResult = await validateSql(config, { sql });

		if (
			!validationResult.tables ||
			Object.keys(validationResult.tables).length === 0
		) {
			logger.log(chalk.yellow(" warning"));
			logger.warn(
				"  SQL validation returned no tables - this might indicate an issue with the query"
			);
		} else {
			logger.log(chalk.green(" done"));
		}

		setupConfig.pipelineConfig = {
			name: setupConfig.pipelineName,
			sql,
		};
	} catch (error) {
		logger.log(chalk.red(" failed"));

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
			`  ${errorMessage}\n\n  Retry with different SQL?`,
			{ defaultValue: true }
		);

		if (retry) {
			return setupSQLTransformationWithValidation(config, setupConfig);
		} else {
			throw new UserError(
				"SQL validation failed and setup cannot continue without valid pipeline SQL"
			);
		}
	}
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
	logger.log("\nSUMMARY\n");

	const httpStatus = setupConfig.streamConfig.http.enabled
		? setupConfig.streamConfig.http.authentication
			? "enabled (auth required)"
			: "enabled"
		: "disabled";
	const schemaStatus = setupConfig.streamConfig.schema?.fields
		? `${setupConfig.streamConfig.schema.fields.length} field${setupConfig.streamConfig.schema.fields.length === 1 ? "" : "s"}`
		: "unstructured";

	logger.log(`  Stream    ${setupConfig.streamName}`);
	logger.log(chalk.dim(`            HTTP ${httpStatus}, ${schemaStatus}\n`));

	if (setupConfig.sinkConfig.type === "r2") {
		const format = setupConfig.sinkConfig.format?.type || "parquet";
		const compression =
			setupConfig.sinkConfig.format?.type === "parquet"
				? (setupConfig.sinkConfig.format as ParquetFormat).compression || ""
				: "";
		logger.log(`  Sink      ${setupConfig.sinkName}`);
		logger.log(
			chalk.dim(
				`            R2 → ${setupConfig.sinkConfig.config.bucket}, ${format}${compression ? ` + ${compression}` : ""}\n`
			)
		);
	} else {
		logger.log(`  Sink      ${setupConfig.sinkName}`);
		logger.log(
			chalk.dim(
				`            Data Catalog → ${setupConfig.sinkConfig.config.namespace}/${setupConfig.sinkConfig.config.table_name}\n`
			)
		);
	}

	const proceed = await confirm("Create resources?", {
		defaultValue: true,
	});

	if (!proceed) {
		throw new UserError("Setup cancelled");
	}

	const created: { stream?: Stream; sink?: Sink } = {};

	while (!created.stream) {
		try {
			process.stdout.write("\n  Creating stream...");
			created.stream = await createStream(config, setupConfig.streamConfig);
			logger.log(chalk.green(" done"));
		} catch (error) {
			logger.log(chalk.red(" failed"));
			logger.log(
				chalk.dim(`  ${getErrorMessage(error, "Stream creation failed")}`)
			);

			const retry = await confirm("  Retry?", {
				defaultValue: true,
			});
			if (!retry) {
				throw new UserError("Stream creation cancelled");
			}
		}
	}

	while (!created.sink) {
		try {
			process.stdout.write("  Creating sink...");
			created.sink = await createSink(config, setupConfig.sinkConfig);
			logger.log(chalk.green(" done"));
		} catch (error) {
			logger.log(chalk.red(" failed"));
			logger.log(
				chalk.dim(`  ${getErrorMessage(error, "Sink creation failed")}`)
			);

			const retry = await confirm(
				"  Retry? (stream was created successfully)",
				{
					defaultValue: true,
				}
			);
			if (!retry) {
				process.stdout.write("  Cleaning up stream...");
				try {
					await deleteStream(config, created.stream.id);
					logger.log(chalk.green(" done"));
				} catch (cleanupError) {
					logger.log(chalk.red(" failed"));
					logger.warn(
						`  ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
					);
				}
				throw new UserError("Sink creation cancelled");
			}
		}
	}

	return created;
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

	while (true) {
		try {
			process.stdout.write("  Creating pipeline...");
			await createPipeline(config, setupConfig.pipelineConfig);
			logger.log(chalk.green(" done"));

			logger.log(chalk.green("\n✓ Setup complete\n"));

			if (created.stream) {
				await displayUsageExamples(created.stream, config, args);
			}
			return;
		} catch (error) {
			logger.log(chalk.red(" failed"));
			logger.log(
				chalk.dim(`  ${getErrorMessage(error, "Pipeline creation failed")}`)
			);
			logger.log(
				chalk.dim(
					"\n  Stream and sink were created, but pipeline creation failed."
				)
			);

			const retry = await confirm("  Try again with different SQL?", {
				defaultValue: true,
			});
			if (!retry) {
				logger.log(
					chalk.dim(
						"\n  You can create the pipeline later with: wrangler pipelines create"
					)
				);
				logger.log(
					chalk.dim(
						`  Your stream "${setupConfig.streamName}" and sink "${setupConfig.sinkName}" are ready.`
					)
				);
				return;
			}

			await setupSQLTransformationWithValidation(config, setupConfig);
		}
	}
}
