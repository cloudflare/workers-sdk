import { readFileSync } from "node:fs";
import { createCommand } from "../../core/create-command";
import { UserError } from "../../errors";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { createPipeline, getPipeline, getStream, validateSql } from "../client";
import { displayUsageExamples } from "./streams/utils";
import type { CreatePipelineRequest } from "../types";

export const pipelinesCreateCommand = createCommand({
	metadata: {
		description: "Create a new pipeline",
		owner: "Product: Pipelines",
		status: "open-beta",
	},
	args: {
		pipeline: {
			describe: "The name of the pipeline to create",
			type: "string",
			demandOption: true,
		},
		sql: {
			describe: "Inline SQL query for the pipeline",
			type: "string",
		},
		"sql-file": {
			describe: "Path to file containing SQL query for the pipeline",
			type: "string",
		},
		legacy: {
			type: "boolean",
			describe: "Use the legacy Pipelines API",
			default: false,
		},
	},
	positionalArgs: ["pipeline"],

	async handler(args, { config }) {
		await requireAuth(config);
		const pipelineName = args.pipeline;

		if (args.legacy) {
			throw new UserError(
				"Creating legacy pipelines is not supported. Please use the v1 Pipelines API without the --legacy flag."
			);
		}

		if (!args.sql && !args.sqlFile) {
			throw new UserError("Either --sql or --sql-file must be provided");
		}
		if (args.sql && args.sqlFile) {
			throw new UserError("Cannot specify both --sql and --sql-file");
		}

		let sql: string;
		if (args.sql) {
			sql = args.sql;
		} else if (args.sqlFile) {
			try {
				sql = readFileSync(args.sqlFile, "utf-8").trim();
			} catch (error) {
				throw new UserError(
					`Failed to read SQL file '${args.sqlFile}': ${error instanceof Error ? error.message : String(error)}`
				);
			}
		} else {
			// This should never happen due to earlier validation
			throw new UserError("Either --sql or --sql-file must be provided");
		}

		if (!sql) {
			throw new UserError("SQL query cannot be empty");
		}

		// Validate SQL before creating pipeline
		logger.log("🌀 Validating SQL...");
		try {
			const validationResult = await validateSql(config, { sql });

			if (
				validationResult.tables &&
				Object.keys(validationResult.tables).length > 0
			) {
				const tableNames = Object.keys(validationResult.tables);
				logger.log(
					`✅ SQL validated successfully. References tables: ${tableNames.join(", ")}`
				);
			} else {
				logger.log("✅ SQL validated successfully.");
			}
		} catch (error) {
			let errorMessage = "Unknown validation error";
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
			throw new UserError(`SQL validation failed: ${errorMessage}`);
		}

		const pipelineConfig: CreatePipelineRequest = {
			name: pipelineName,
			sql,
		};

		logger.log(`🌀 Creating pipeline '${pipelineName}'...`);

		const pipeline = await createPipeline(config, pipelineConfig);

		logger.log(
			`✨ Successfully created pipeline '${pipeline.name}' with id '${pipeline.id}'.`
		);

		try {
			const fullPipeline = await getPipeline(config, pipeline.id);

			const streamTable = fullPipeline.tables?.find(
				(table) => table.type === "stream"
			);

			if (streamTable) {
				const stream = await getStream(config, streamTable.id);
				displayUsageExamples(stream);
			} else {
				logger.log(
					`\nRun 'wrangler pipelines get ${pipeline.id}' to view full details.`
				);
			}
		} catch {
			logger.warn("Could not fetch pipeline details for usage examples.");
			logger.log(
				`\nRun 'wrangler pipelines get ${pipeline.id}' to view full details.`
			);
		}
	},
});
