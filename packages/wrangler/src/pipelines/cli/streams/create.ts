import { readFileSync } from "node:fs";
import { parseJSON, UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../../core/create-command";
import { confirm } from "../../../dialogs";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { createStream } from "../../client";
import { validateEntityName } from "../../validate";
import { displayStreamConfiguration } from "./utils";
import type { CreateStreamRequest, SchemaField } from "../../types";

export const pipelinesStreamsCreateCommand = createCommand({
	metadata: {
		description: "Create a new stream",
		owner: "Product: Pipelines",
		status: "open beta",
	},
	positionalArgs: ["stream"],
	args: {
		stream: {
			describe: "The name of the stream to create",
			type: "string",
			demandOption: true,
		},
		"schema-file": {
			describe: "Path to JSON file containing stream schema",
			type: "string",
		},
		"http-enabled": {
			describe: "Enable HTTP endpoint",
			type: "boolean",
			default: true,
		},
		"http-auth": {
			describe: "Require authentication for HTTP endpoint",
			type: "boolean",
			default: true,
		},
		"cors-origin": {
			describe: "CORS origin",
			type: "string",
			array: true,
		},
	},
	validateArgs: (args) => {
		validateEntityName("stream", args.stream);
	},
	async handler(args, { config }) {
		await requireAuth(config);
		const streamName = args.stream;

		const corsOrigins = args.corsOrigin;

		let schema: { fields: SchemaField[] } | undefined;
		if (args.schemaFile) {
			let schemaContent: string;
			let parsedSchema: { fields: SchemaField[] };

			try {
				schemaContent = readFileSync(args.schemaFile, "utf-8");
			} catch (error) {
				throw new UserError(
					`Failed to read schema file '${args.schemaFile}': ${error instanceof Error ? error.message : String(error)}`,
					{
						telemetryMessage:
							"pipelines streams create schema file read failed",
					}
				);
			}

			let parsed: Record<string, unknown>;
			try {
				parsed = parseJSON(schemaContent, args.schemaFile) as Record<
					string,
					unknown
				>;
			} catch (error) {
				throw new UserError(
					`Failed to parse schema file '${args.schemaFile}': ${error instanceof Error ? error.message : String(error)}`,
					{
						telemetryMessage:
							"pipelines streams create schema file parse failed",
					}
				);
			}

			// Accept both a direct schema object ({ fields: [...] }) and a full
			// stream response from `streams get --json` (which nests the schema
			// under a "schema" key).
			if (
				parsed &&
				typeof parsed.schema === "object" &&
				parsed.schema !== null &&
				Array.isArray((parsed.schema as { fields?: unknown }).fields)
			) {
				parsedSchema = parsed.schema as { fields: SchemaField[] };
			} else if (parsed && Array.isArray(parsed.fields)) {
				parsedSchema = parsed as unknown as { fields: SchemaField[] };
			} else {
				throw new UserError(
					"Schema file must contain a 'fields' array, or be the JSON output of `wrangler pipelines streams get --json`",
					{
						telemetryMessage: "pipelines streams create invalid schema file",
					}
				);
			}

			schema = parsedSchema;
		} else {
			// No schema file provided - confirm with user
			const confirmNoSchema = await confirm(
				"No schema file provided. Do you want to create stream without a schema (unstructured JSON)?",
				{ defaultValue: false }
			);

			if (!confirmNoSchema) {
				throw new UserError(
					"Stream creation cancelled. Please provide a schema file using --schema-file",
					{ telemetryMessage: "pipelines streams create cancelled" }
				);
			}
		}

		const streamConfig: CreateStreamRequest = {
			name: streamName,
			format: { type: "json" as const, ...(!schema && { unstructured: true }) },
			http: {
				enabled: args.httpEnabled,
				authentication: args.httpAuth,
				...(args.httpEnabled &&
					corsOrigins &&
					corsOrigins.length > 0 && { cors: { origins: corsOrigins } }),
			},
			worker_binding: {
				enabled: true,
			},
			...(schema && { schema }),
		};

		logger.log(`🌀 Creating stream '${streamName}'...`);

		const stream = await createStream(config, streamConfig);

		logger.log(
			`✨ Successfully created stream '${stream.name}' with id '${stream.id}'.`
		);

		displayStreamConfiguration(stream, "Creation Summary", {
			includeTimestamps: false,
		});
	},
});
