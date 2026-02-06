import chalk from "chalk";
import { logger } from "../../../logger";
import { createdResourceConfig } from "../../../utils/add-created-resource-config";
import formatLabelledValues from "../../../utils/render-labelled-values";
import type { SchemaField, Stream } from "../../types";
import type { Config } from "@cloudflare/workers-utils";

export function formatSchemaFieldsForTable(
	fields: SchemaField[],
	indent = 0
): Array<{
	"Field Name": string;
	Type: string;
	"Unit/Items": string;
	Required: string;
}> {
	const result: Array<{
		"Field Name": string;
		Type: string;
		"Unit/Items": string;
		Required: string;
	}> = [];
	const indentStr = "  ".repeat(indent);

	for (const field of fields) {
		let unitItems = "";

		if (field.unit) {
			unitItems = field.unit;
		}

		if (field.type === "list" && field.items) {
			unitItems = field.items.type;
		}

		const row = {
			"Field Name": `${indentStr}${field.name}`,
			Type: field.type,
			"Unit/Items": unitItems,
			Required: field.required ? "Yes" : "No",
		};

		result.push(row);

		if (field.type === "struct" && field.fields) {
			result.push(...formatSchemaFieldsForTable(field.fields, indent + 1));
		}

		if (
			field.type === "list" &&
			field.items &&
			field.items.type === "struct" &&
			field.items.fields
		) {
			result.push(
				...formatSchemaFieldsForTable(field.items.fields, indent + 1)
			);
		}
	}

	return result;
}

export function displayStreamConfiguration(
	stream: Stream,
	title: string = "Configuration",
	options: { includeTimestamps?: boolean } = {}
) {
	const { includeTimestamps = true } = options;

	if (title) {
		logger.log(`\n${title}:`);
	}

	const general: Record<string, string> = {
		Name: stream.name,
	};

	if (includeTimestamps) {
		general["Created At"] = new Date(stream.created_at).toLocaleString();
		general["Modified At"] = new Date(stream.modified_at).toLocaleString();
	}

	const httpIngest: Record<string, string> = {
		Enabled: stream.http.enabled ? "Yes" : "No",
	};

	if (stream.http.enabled) {
		httpIngest.Authentication = stream.http.authentication ? "Yes" : "No";
		httpIngest.Endpoint = stream.endpoint;

		if (
			stream.http.cors &&
			stream.http.cors.origins &&
			stream.http.cors.origins.length > 0
		) {
			httpIngest["CORS Origins"] = stream.http.cors.origins.join(", ");
		} else {
			httpIngest["CORS Origins"] = "None";
		}
	}

	logger.log("General:");
	logger.log(formatLabelledValues(general, { indentationCount: 2 }));

	logger.log("\nHTTP Ingest:");
	logger.log(formatLabelledValues(httpIngest, { indentationCount: 2 }));

	if (stream.schema && stream.schema.fields.length > 0) {
		logger.log("\nInput Schema:");
		const schemaRows = formatSchemaFieldsForTable(stream.schema.fields);
		logger.table(schemaRows);
	} else {
		logger.log("\nInput Schema: Unstructured JSON (single 'value' column)");
	}
}

function generateStreamBindingName(streamName: string): string {
	const upperName = streamName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
	return upperName.endsWith("_STREAM") ? upperName : upperName + "_STREAM";
}

type SampleValue =
	| string
	| number
	| boolean
	| null
	| Record<string, unknown>
	| SampleValue[];

function generateSampleValue(field: SchemaField): SampleValue {
	switch (field.type) {
		case "bool":
			return true;
		case "int32":
			return 42;
		case "int64":
			return "9223372036854775807"; // Large numbers as strings to avoid JS precision issues
		case "float32":
		case "float64":
			return 3.14;
		case "json":
			return { example: "json_value" };
		case "bytes":
			return "base64_encoded_bytes";
		case "string":
			return `sample_${field.name}`;
		case "timestamp":
			// Return timestamp based on unit
			if (field.unit === "second") {
				return Math.floor(Date.now() / 1000);
			} else if (field.unit === "millisecond") {
				return Date.now();
			} else if (field.unit === "microsecond") {
				return Date.now() * 1000;
			} else if (field.unit === "nanosecond") {
				return Date.now() * 1000000;
			}
			return Date.now(); // Default to milliseconds
		case "list":
			if (field.items) {
				return [
					generateSampleValue(field.items),
					generateSampleValue(field.items),
				];
			}
			return [];
		case "struct":
			if (field.fields) {
				const structObj: Record<string, SampleValue> = {};
				field.fields.forEach((subField) => {
					structObj[subField.name] = generateSampleValue(subField);
				});
				return structObj;
			}
			return {};
		default:
			return null;
	}
}

function generateExampleData(stream: Stream): string {
	if (
		stream.schema &&
		stream.schema.fields &&
		stream.schema.fields.length > 0
	) {
		const exampleObject: Record<string, SampleValue> = {};

		stream.schema.fields.forEach((field) => {
			exampleObject[field.name] = generateSampleValue(field);
		});

		return JSON.stringify(exampleObject, null, 2);
	} else {
		// Default unstructured example
		return JSON.stringify(
			{
				user_id: "sample_user_id",
				event_name: "sample_event_name",
				timestamp: Date.now(),
			},
			null,
			2
		);
	}
}

export async function displayUsageExamples(
	stream: Stream,
	config: Config,
	args: { env?: string }
) {
	const bindingName = generateStreamBindingName(stream.name);
	const exampleData = generateExampleData(stream);
	const compactData = JSON.stringify(JSON.parse(exampleData));

	await createdResourceConfig(
		"pipelines",
		(customBindingName) => ({
			pipeline: stream.id,
			binding: customBindingName ?? bindingName,
		}),
		config.configPath,
		args.env,
		{ updateConfig: false }
	);

	logger.log("\nThen send events:\n");
	logger.log(`  await env.${bindingName}.send([${compactData}]);\n`);

	if (stream.http.enabled) {
		logger.log("Or via HTTP:\n");

		const curlCommand = [
			`curl -X POST ${stream.endpoint}`,
			stream.http.authentication
				? `-H "Authorization: Bearer YOUR_API_TOKEN"`
				: null,
			`-H "Content-Type: application/json"`,
			`-d '[${compactData}]'`,
		]
			.filter(Boolean)
			.join(" \\\n     ");

		logger.log(`  ${curlCommand}\n`);

		if (stream.http.authentication) {
			logger.log(
				chalk.dim("  (Replace YOUR_API_TOKEN with your Cloudflare API token)")
			);
		}
	}

	logger.log(chalk.dim("Docs: https://developers.cloudflare.com/pipelines/\n"));
}
