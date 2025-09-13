import { readFileSync } from "node:fs";
import { createCommand } from "../../../core/create-command";
import { confirm } from "../../../dialogs";
import { UserError } from "../../../errors";
import { logger } from "../../../logger";
import { parseJSON } from "../../../parse";
import { requireAuth } from "../../../user";
import { createStream } from "../../client";
import { displayStreamConfiguration } from "./utils";
import type { CreateStreamRequest, SchemaField } from "../../types";

export const pipelinesStreamsCreateCommand = createCommand({
	metadata: {
		description: "Create a new stream",
		owner: "Product: Pipelines",
		status: "open-beta",
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
		"cors-origins": {
			describe: "Comma-separated CORS origins",
			type: "string",
		},
	},
	async handler(args, { config }) {
		await requireAuth(config);
		const streamName = args.stream;

		let corsOrigins: string[] | undefined;
		if (args.corsOrigins) {
			corsOrigins =
				args.corsOrigins === "*"
					? ["*"]
					: args.corsOrigins.split(",").map((origin) => origin.trim());
		}

		let schema: { fields: SchemaField[] } | undefined;
		if (args.schemaFile) {
			try {
				const schemaContent = readFileSync(args.schemaFile, "utf-8");
				const parsedSchema = parseJSON(schemaContent, args.schemaFile) as {
					fields: SchemaField[];
				};

				if (!parsedSchema || !Array.isArray(parsedSchema.fields)) {
					throw new UserError("Schema file must contain a 'fields' array");
				}

				schema = parsedSchema;
			} catch (error) {
				throw new UserError(
					`Failed to read or parse schema file '${args.schemaFile}': ${error instanceof Error ? error.message : String(error)}`
				);
			}
		} else {
			// No schema file provided - confirm with user
			const confirmNoSchema = await confirm(
				"No schema file provided. Create stream without a schema (unstructured JSON)?",
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
					corsOrigins && { cors: { origins: corsOrigins } }),
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
