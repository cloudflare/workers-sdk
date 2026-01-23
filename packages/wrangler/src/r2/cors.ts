import path from "node:path";
import { parseJSON, readFileSync, UserError } from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { requireAuth } from "../user";
import formatLabelledValues from "../utils/render-labelled-values";
import {
	deleteCORSPolicy,
	getCORSPolicy,
	putCORSPolicy,
	tableFromCORSPolicyResponse,
} from "./helpers/bucket";
import type { CORSRule } from "./helpers/bucket";

export const r2BucketCORSNamespace = createNamespace({
	metadata: {
		description: "Manage CORS configuration for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
});

export const r2BucketCORSListCommand = createCommand({
	metadata: {
		description: "List the CORS rules for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
		logArgs: true,
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the R2 bucket to list the CORS rules for",
			type: "string",
			demandOption: true,
		},
		jurisdiction: {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
	},
	async handler({ bucket, jurisdiction }, { config }) {
		const accountId = await requireAuth(config);

		logger.log(`Listing CORS rules for bucket '${bucket}'...`);
		const corsPolicy = await getCORSPolicy(
			config,
			accountId,
			bucket,
			jurisdiction
		);

		if (corsPolicy.length === 0) {
			logger.log(
				`There is no CORS configuration defined for bucket '${bucket}'.`
			);
		} else {
			const tableOutput = tableFromCORSPolicyResponse(corsPolicy);
			logger.log(tableOutput.map((x) => formatLabelledValues(x)).join("\n\n"));
		}
	},
});

export const r2BucketCORSSetCommand = createCommand({
	metadata: {
		description: "Set the CORS configuration for an R2 bucket from a JSON file",
		status: "stable",
		owner: "Product: R2",
		logArgs: true,
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the R2 bucket to set the CORS configuration for",
			type: "string",
			demandOption: true,
		},
		file: {
			describe: "Path to the JSON file containing the CORS configuration",
			type: "string",
			demandOption: true,
			requiresArg: true,
		},
		jurisdiction: {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
		force: {
			describe: "Skip confirmation",
			type: "boolean",
			alias: "y",
			default: false,
		},
	},
	async handler({ bucket, file, jurisdiction, force }, { config }) {
		const accountId = await requireAuth(config);

		const jsonFilePath = path.resolve(file);

		const corsConfig = parseJSON(readFileSync(jsonFilePath), jsonFilePath) as {
			rules: CORSRule[];
		};

		if (!corsConfig.rules || !Array.isArray(corsConfig.rules)) {
			throw new UserError(
				`The CORS configuration file must contain a 'rules' array as expected by the request body of the CORS API: ` +
					`https://developers.cloudflare.com/api/operations/r2-put-bucket-cors-policy`
			);
		}

		if (!force) {
			const confirmedRemoval = await confirm(
				`Are you sure you want to overwrite the existing CORS configuration for bucket '${bucket}'?`
			);
			if (!confirmedRemoval) {
				logger.log("Set cancelled.");
				return;
			}
		}

		logger.log(
			`Setting CORS configuration (${corsConfig.rules.length} rules) for bucket '${bucket}'...`
		);
		await putCORSPolicy(
			config,
			accountId,
			bucket,
			corsConfig.rules,
			jurisdiction
		);
		logger.log(`✨ Set CORS configuration for bucket '${bucket}'.`);
	},
});

export const r2BucketCORSDeleteCommand = createCommand({
	metadata: {
		description: "Clear the CORS configuration for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
		logArgs: true,
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe:
				"The name of the R2 bucket to delete the CORS configuration for",
			type: "string",
			demandOption: true,
		},
		jurisdiction: {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
		force: {
			describe: "Skip confirmation",
			type: "boolean",
			alias: "y",
			default: false,
		},
	},
	async handler({ bucket, jurisdiction, force }, { config }) {
		const accountId = await requireAuth(config);

		if (!force) {
			const confirmedRemoval = await confirm(
				`Are you sure you want to clear the existing CORS configuration for bucket '${bucket}'?`
			);
			if (!confirmedRemoval) {
				logger.log("Set cancelled.");
				return;
			}
		}

		logger.log(`Deleting the CORS configuration for bucket '${bucket}'...`);
		await deleteCORSPolicy(config, accountId, bucket, jurisdiction);
		logger.log(`CORS configuration deleted for bucket '${bucket}'.`);
	},
});
