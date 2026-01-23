import { ParseError, readFileSync, UserError } from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "../core/create-command";
import { confirm, prompt } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { requireAuth } from "../user";
import formatLabelledValues from "../utils/render-labelled-values";
import {
	getBucketLockRules,
	putBucketLockRules,
	tableFromBucketLockRulesResponse,
} from "./helpers/bucket";
import { isValidDate } from "./helpers/misc";
import type { BucketLockRule } from "./helpers/bucket";

export const r2BucketLockNamespace = createNamespace({
	metadata: {
		description: "Manage lock rules for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
});

export const r2BucketLockListCommand = createCommand({
	metadata: {
		description: "List lock rules for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
		logArgs: true,
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the R2 bucket to list lock rules for",
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
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		const { bucket, jurisdiction } = args;

		logger.log(`Listing lock rules for bucket '${bucket}'...`);

		const rules = await getBucketLockRules(
			config,
			accountId,
			bucket,
			jurisdiction
		);

		if (rules.length === 0) {
			logger.log(`There are no lock rules for bucket '${bucket}'.`);
		} else {
			const tableOutput = tableFromBucketLockRulesResponse(rules);
			logger.log(tableOutput.map((x) => formatLabelledValues(x)).join("\n\n"));
		}
	},
});

export const r2BucketLockAddCommand = createCommand({
	metadata: {
		description: "Add a lock rule to an R2 bucket",
		status: "stable",
		owner: "Product: R2",
		logArgs: true,
	},
	positionalArgs: ["bucket", "name", "prefix"],
	args: {
		bucket: {
			describe: "The name of the R2 bucket to add a bucket lock rule to",
			type: "string",
			demandOption: true,
		},
		name: {
			describe:
				"A unique name for the bucket lock rule, used to identify and manage it.",
			alias: "id",
			type: "string",
			requiresArg: true,
		},
		prefix: {
			describe:
				'Prefix condition for the bucket lock rule (set to "" for all prefixes)',
			type: "string",
			requiresArg: true,
		},
		"retention-days": {
			describe: "Number of days which objects will be retained for",
			type: "number",
			conflicts: ["retention-date", "retention-indefinite"],
		},
		"retention-date": {
			describe: "Date after which objects will be retained until (YYYY-MM-DD)",
			type: "string",
			conflicts: ["retention-days", "retention-indefinite"],
		},
		"retention-indefinite": {
			describe: "Retain objects indefinitely",
			type: "boolean",
			conflicts: ["retention-date", "retention-days"],
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
	async handler(
		{
			bucket,
			retentionDays,
			retentionDate,
			retentionIndefinite,
			jurisdiction,
			force,
			name,
			prefix,
		},
		{ config }
	) {
		const accountId = await requireAuth(config);

		const rules = await getBucketLockRules(
			config,
			accountId,
			bucket,
			jurisdiction
		);

		if (!name && !isNonInteractiveOrCI() && !force) {
			name = await prompt("Enter a unique name for the lock rule");
		}

		if (!name) {
			throw new UserError("Must specify a rule name.", {
				telemetryMessage: true,
			});
		}

		const newRule: BucketLockRule = {
			id: name,
			enabled: true,
			condition: { type: "Indefinite" },
		};
		if (prefix === undefined && !force) {
			prefix = await prompt(
				'Enter a prefix for the bucket lock rule (set to "" for all prefixes)',
				{ defaultValue: "" }
			);
			if (prefix === "") {
				const confirmedAdd = await confirm(
					`Are you sure you want to add lock rule '${name}' to bucket '${bucket}' without a prefix? ` +
						`The lock rule will apply to all objects in your bucket.`,
					{ defaultValue: false }
				);
				if (!confirmedAdd) {
					logger.log("Add cancelled.");
					return;
				}
			}
		}

		if (prefix) {
			newRule.prefix = prefix;
		}

		if (
			retentionDays === undefined &&
			retentionDate === undefined &&
			retentionIndefinite === undefined &&
			!force
		) {
			retentionIndefinite = await confirm(
				`Are you sure you want to add lock rule '${name}' to bucket '${bucket}' without retention? ` +
					`The lock rule will apply to all matching objects indefinitely.`,
				{ defaultValue: false }
			);
			if (retentionIndefinite !== true) {
				logger.log("Add cancelled.");
				return;
			}
		}

		if (retentionDays !== undefined) {
			if (!isNaN(retentionDays)) {
				if (retentionDays > 0) {
					const conditionDaysValue = Number(retentionDays) * 86400; // Convert days to seconds
					newRule.condition = {
						type: "Age",
						maxAgeSeconds: conditionDaysValue,
					};
				} else {
					throw new UserError(
						`Days must be a positive number: ${retentionDays}`,
						{
							telemetryMessage: "Retention days not a positive number.",
						}
					);
				}
			} else {
				throw new UserError(`Days must be a number.`, {
					telemetryMessage: "Retention days not a positive number.",
				});
			}
		} else if (retentionDate !== undefined) {
			if (isValidDate(retentionDate)) {
				const date = new Date(`${retentionDate}T00:00:00.000Z`);
				const conditionDateValue = date.toISOString();
				newRule.condition = {
					type: "Date",
					date: conditionDateValue,
				};
			} else {
				throw new UserError(
					`Date must be a valid date in the YYYY-MM-DD format: ${String(retentionDate)}`,
					{
						telemetryMessage:
							"Retention date not a valid date in the YYYY-MM-DD format.",
					}
				);
			}
		} else if (
			retentionIndefinite !== undefined &&
			retentionIndefinite === true
		) {
			newRule.condition = {
				type: "Indefinite",
			};
		} else {
			throw new UserError(`Retention must be specified.`, {
				telemetryMessage: "Lock retention not specified.",
			});
		}
		rules.push(newRule);
		logger.log(`Adding lock rule '${name}' to bucket '${bucket}'...`);
		await putBucketLockRules(config, accountId, bucket, rules, jurisdiction);
		logger.log(`✨ Added lock rule '${name}' to bucket '${bucket}'.`);
	},
});

export const r2BucketLockRemoveCommand = createCommand({
	metadata: {
		description: "Remove a bucket lock rule from an R2 bucket",
		status: "stable",
		owner: "Product: R2",
		logArgs: true,
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the R2 bucket to remove a bucket lock rule from",
			type: "string",
			demandOption: true,
		},
		name: {
			describe: "The unique name of the bucket lock rule to remove",
			alias: "id",
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
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		const { bucket, name, jurisdiction } = args;

		const lockPolicies = await getBucketLockRules(
			config,
			accountId,
			bucket,
			jurisdiction
		);

		const index = lockPolicies.findIndex((policy) => policy.id === name);

		if (index === -1) {
			throw new UserError(
				`Lock rule with ID '${name}' not found in configuration for '${bucket}'.`,
				{
					telemetryMessage:
						"Lock rule with name not found in configuration for bucket.",
				}
			);
		}

		lockPolicies.splice(index, 1);

		logger.log(`Removing lock rule '${name}' from bucket '${bucket}'...`);
		await putBucketLockRules(
			config,
			accountId,
			bucket,
			lockPolicies,
			jurisdiction
		);
		logger.log(`Lock rule '${name}' removed from bucket '${bucket}'.`);
	},
});

export const r2BucketLockSetCommand = createCommand({
	metadata: {
		description: "Set the lock configuration for an R2 bucket from a JSON file",
		status: "stable",
		owner: "Product: R2",
		logArgs: true,
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the R2 bucket to set lock configuration for",
			type: "string",
			demandOption: true,
		},
		file: {
			describe: "Path to the JSON file containing lock configuration",
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
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		const { bucket, file, jurisdiction, force } = args;
		let lockRule: { rules: BucketLockRule[] };
		try {
			lockRule = JSON.parse(readFileSync(file));
		} catch (e) {
			if (e instanceof Error) {
				throw new ParseError({
					text: `Failed to read or parse the lock configuration config file: '${e.message}'`,
					telemetryMessage:
						"Failed to read or parse the lock configuration config file.",
				});
			} else {
				throw e;
			}
		}

		if (!lockRule.rules || !Array.isArray(lockRule.rules)) {
			throw new UserError(
				"The lock configuration file must contain a 'rules' array.",
				{ telemetryMessage: true }
			);
		}

		if (!force) {
			const confirmedRemoval = await confirm(
				`Are you sure you want to overwrite all existing lock rules for bucket '${bucket}'?`,
				{ defaultValue: true }
			);
			if (!confirmedRemoval) {
				logger.log("Set cancelled.");
				return;
			}
		}
		logger.log(
			`Setting lock configuration (${lockRule.rules.length} rules) for bucket '${bucket}'...`
		);
		await putBucketLockRules(
			config,
			accountId,
			bucket,
			lockRule.rules,
			jurisdiction
		);
		logger.log(`✨ Set lock configuration for bucket '${bucket}'.`);
	},
});
