import { createCommand } from "../../core/create-command";
import { UserError } from "../../errors";
import { requireAuth } from "../../user";
import { validateCorsOrigins, validateInRange } from "../validate";
import { updateLegacyPipeline } from "./legacy-helpers";

export const pipelinesUpdateCommand = createCommand({
	metadata: {
		description: "Update a pipeline (legacy pipelines only)",
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
		legacy: {
			type: "boolean",
			describe: "Use the legacy Pipelines API",
			default: false,
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		if (args.legacy) {
			return await updateLegacyPipeline(config, accountId, args);
		}

		throw new UserError(
			"The update command is not supported for pipelines created with the V1 API. Use the --legacy flag to update legacy pipelines."
		);
	},
});
