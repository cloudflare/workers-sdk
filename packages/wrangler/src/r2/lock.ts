import { createCommand, createNamespace } from "../core/create-command";
import { confirm, prompt } from "../dialogs";
import { UserError } from "../errors";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { ParseError, readFileSync } from "../parse";
import { requireAuth } from "../user";
import formatLabelledValues from "../utils/render-labelled-values";
import {
	getBucketLockRules,
	isValidDate,
	putBucketLockRules,
	tableFromBucketLockRulesResponse,
} from "./helpers";
import type { BucketLockRule } from "./helpers";

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

		const rules = await getBucketLockRules(accountId, bucket, jurisdiction);

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
	},
	positionalArgs: ["bucket", "id", "prefix"],
	args: {
		bucket: {
			describe: "The name of the R2 bucket to add a bucket lock rule to",
			type: "string",
			demandOption: true,
		},
		id: {
			describe: "A unique identifier for the bucket lock rule",
			type: "string",
			requiresArg: true,
		},
		prefix: {
			describe:
				'Prefix condition for the bucket lock rule (set to "" for all prefixes)',
			type: "string",
			requiresArg: true,
		},
		"lock-days": {
			describe: "Number of days after which objects expire",
			type: "number",
			conflicts: "lock-date",
		},
		"lock-date": {
			describe: "Date after which objects expire (YYYY-MM-DD)",
			type: "string",
			conflicts: "lock-days",
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
		{ bucket, lockDays, lockDate, jurisdiction, force, id, prefix },
		{ config }
	) {
		const accountId = await requireAuth(config);

		const rules = await getBucketLockRules(accountId, bucket, jurisdiction);

		if (!id && !isNonInteractiveOrCI() && !force) {
			id = await prompt("Enter a unique identifier for the lock rule");
		}

		if (!id) {
			throw new UserError("Must specify a rule ID.", {
				telemetryMessage: true,
			});
		}

		const newRule: BucketLockRule = {
			id: id,
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
					`Are you sure you want to add lock rule '${id}' to bucket '${bucket}' without a prefix? ` +
						`The lock rule will apply to all objects in your bucket.`
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

		if (lockDays === undefined && lockDate === undefined && !force) {
			const confirmIndefinite = await confirm(
				`Are you sure you want to add lock rule '${id}' to bucket '${bucket}' without an expiration? ` +
					`The lock rule will apply to all matching objects indefinitely.`,
				{ defaultValue: true }
			);
			if (confirmIndefinite !== true) {
				logger.log("Add cancelled.");
				return;
			}
		}

		if (lockDays !== undefined) {
			if (!isNaN(lockDays)) {
				if (lockDays > 0) {
					const conditionDaysValue = Number(lockDays) * 86400; // Convert days to seconds
					newRule.condition = {
						type: "Age",
						maxAgeSeconds: conditionDaysValue,
					};
				} else {
					throw new UserError(`Days must be a positive number: ${lockDays}`, {
						telemetryMessage: "Lock days not a positive number.",
					});
				}
			} else {
				throw new UserError(`Days must be a number.`, {
					telemetryMessage: "Lock days not a positive number.",
				});
			}
		} else if (lockDate !== undefined) {
			if (isValidDate(lockDate)) {
				const date = new Date(`${lockDate}T00:00:00.000Z`);
				const conditionDateValue = date.toISOString();
				newRule.condition = {
					type: "Date",
					date: conditionDateValue,
				};
			} else {
				throw new UserError(
					`Date must be a valid date in the YYYY-MM-DD format: ${String(lockDate)}`,
					{
						telemetryMessage:
							"Lock date not a valid date in the YYYY-MM-DD format.",
					}
				);
			}
		} else {
			newRule.condition = {
				type: "Indefinite",
			};
		}
		rules.push(newRule);
		logger.log(`Adding lock rule '${id}' to bucket '${bucket}'...`);
		await putBucketLockRules(accountId, bucket, rules, jurisdiction);
		logger.log(`✨ Added lock rule '${id}' to bucket '${bucket}'.`);
	},
});

export const r2BucketLockRemoveCommand = createCommand({
	metadata: {
		description: "Remove a bucket lock rule from an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the R2 bucket to remove a bucket lock rule from",
			type: "string",
			demandOption: true,
		},
		id: {
			describe: "The unique identifier of the bucket lock rule to remove",
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

		const { bucket, id, jurisdiction } = args;

		const lockPolicies = await getBucketLockRules(
			accountId,
			bucket,
			jurisdiction
		);

		const index = lockPolicies.findIndex((policy) => policy.id === id);

		if (index === -1) {
			throw new UserError(
				`Lock rule with ID '${id}' not found in configuration for '${bucket}'.`,
				{
					telemetryMessage:
						"Lock rule with ID not found in configuration for bucket.",
				}
			);
		}

		lockPolicies.splice(index, 1);

		logger.log(`Removing lock rule '${id}' from bucket '${bucket}'...`);
		await putBucketLockRules(accountId, bucket, lockPolicies, jurisdiction);
		logger.log(`Lock rule '${id}' removed from bucket '${bucket}'.`);
	},
});

export const r2BucketLockSetCommand = createCommand({
	metadata: {
		description: "Set the lock configuration for an R2 bucket from a JSON file",
		status: "stable",
		owner: "Product: R2",
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
		await putBucketLockRules(accountId, bucket, lockRule.rules, jurisdiction);
		logger.log(`✨ Set lock configuration for bucket '${bucket}'.`);
	},
});
