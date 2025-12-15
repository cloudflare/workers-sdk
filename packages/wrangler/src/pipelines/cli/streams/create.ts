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
					`Failed to read schema file '${args.schemaFile}': ${error instanceof Error ? error.message : String(error)}`
				);
			}

			try {
				parsedSchema = parseJSON(schemaContent, args.schemaFile) as {
					fields: SchemaField[];
				};
			} catch (error) {
				throw new UserError(
					`Failed to parse schema file '${args.schemaFile}': ${error instanceof Error ? error.message : String(error)}`
				);
			}

			if (!parsedSchema || !Array.isArray(parsedSchema.fields)) {
				throw new UserError("Schema file must contain a 'fields' array");
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
					"Stream creation cancelled. Please provide a schema file using --schema-file"
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
