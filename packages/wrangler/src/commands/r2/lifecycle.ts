import { readFileSync, UserError } from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "../../core/create-command";
import { confirm, multiselect, prompt } from "../../dialogs";
import isInteractive from "../../is-interactive";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import formatLabelledValues from "../../utils/render-labelled-values";
import {
	getLifecycleRules,
	putLifecycleRules,
	tableFromLifecycleRulesResponse,
} from "./helpers/bucket";
import {
	formatActionDescription,
	isNonNegativeNumber,
	isValidDate,
} from "./helpers/misc";
import type { LifecycleRule } from "./helpers/bucket";

export const r2BucketLifecycleNamespace = createNamespace({
	metadata: {
		description: "Manage lifecycle rules for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
});

export const r2BucketLifecycleListCommand = createCommand({
	metadata: {
		description: "List lifecycle rules for an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the R2 bucket to list lifecycle rules for",
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

		logger.log(`Listing lifecycle rules for bucket '${bucket}'...`);

		const lifecycleRules = await getLifecycleRules(
			config,
			accountId,
			bucket,
			jurisdiction
		);

		if (lifecycleRules.length === 0) {
			logger.log(`There are no lifecycle rules for bucket '${bucket}'.`);
		} else {
			const tableOutput = tableFromLifecycleRulesResponse(lifecycleRules);
			logger.log(tableOutput.map((x) => formatLabelledValues(x)).join("\n\n"));
		}
	},
});

export const r2BucketLifecycleAddCommand = createCommand({
	metadata: {
		description: "Add a lifecycle rule to an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["bucket", "name", "prefix"],
	args: {
		bucket: {
			describe: "The name of the R2 bucket to add a lifecycle rule to",
			type: "string",
			demandOption: true,
		},
		name: {
			describe:
				"A unique name for the lifecycle rule, used to identify and manage it.",
			alias: "id",
			type: "string",
			requiresArg: true,
		},
		prefix: {
			describe:
				"Prefix condition for the lifecycle rule (leave empty for all prefixes)",
			type: "string",
			requiresArg: true,
		},
		"expire-days": {
			describe: "Number of days after which objects expire",
			type: "number",
			requiresArg: true,
		},
		"expire-date": {
			describe: "Date after which objects expire (YYYY-MM-DD)",
			type: "string",
			requiresArg: true,
		},
		"ia-transition-days": {
			describe:
				"Number of days after which objects transition to Infrequent Access storage",
			type: "number",
			requiresArg: true,
		},
		"ia-transition-date": {
			describe:
				"Date after which objects transition to Infrequent Access storage (YYYY-MM-DD)",
			type: "string",
			requiresArg: true,
		},
		"abort-multipart-days": {
			describe:
				"Number of days after which incomplete multipart uploads are aborted",
			type: "number",
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
	async handler(
		{
			bucket,
			expireDays,
			expireDate,
			iaTransitionDays,
			iaTransitionDate,
			abortMultipartDays,
			jurisdiction,
			force,
			name,
			prefix,
		},
		{ config }
	) {
		const accountId = await requireAuth(config);

		const lifecycleRules = await getLifecycleRules(
			config,
			accountId,
			bucket,
			jurisdiction
		);

		if (!name && isInteractive()) {
			name = await prompt("Enter a unique name for the lifecycle rule");
		}

		if (!name) {
			throw new UserError("Must specify a rule name.");
		}

		const newRule: LifecycleRule = {
			id: name,
			enabled: true,
			conditions: {},
		};

		let selectedActions: string[] = [];

		if (expireDays !== undefined || expireDate !== undefined) {
			selectedActions.push("expire");
		}
		if (iaTransitionDays !== undefined || iaTransitionDate !== undefined) {
			selectedActions.push("transition");
		}
		if (abortMultipartDays !== undefined) {
			selectedActions.push("abort-multipart");
		}

		if (selectedActions.length === 0 && isInteractive()) {
			if (prefix === undefined) {
				prefix = await prompt(
					"Enter a prefix for the lifecycle rule (leave empty for all prefixes)"
				);
			}
			const actionChoices = [
				{ title: "Expire objects", value: "expire" },
				{
					title: "Transition to Infrequent Access storage class",
					value: "transition",
				},
				{
					title: "Abort incomplete multipart uploads",
					value: "abort-multipart",
				},
			];

			selectedActions = await multiselect("Select the actions to apply", {
				choices: actionChoices,
			});
		}

		if (selectedActions.length === 0) {
			throw new UserError("Must specify at least one action.");
		}

		for (const action of selectedActions) {
			let conditionType: "Age" | "Date";
			let conditionValue: number | string;

			if (action === "abort-multipart") {
				if (abortMultipartDays !== undefined) {
					conditionValue = abortMultipartDays;
				} else {
					conditionValue = await prompt(
						`Enter the number of days after which to ${formatActionDescription(action)}`
					);
				}
				if (!isNonNegativeNumber(String(conditionValue))) {
					throw new UserError("Must be a positive number.");
				}

				conditionType = "Age";
				conditionValue = Number(conditionValue) * 86400; // Convert days to seconds

				newRule.abortMultipartUploadsTransition = {
					condition: {
						maxAge: conditionValue,
						type: conditionType,
					},
				};
			} else {
				if (expireDays !== undefined) {
					conditionType = "Age";
					conditionValue = expireDays;
				} else if (iaTransitionDays !== undefined) {
					conditionType = "Age";
					conditionValue = iaTransitionDays;
				} else if (expireDate !== undefined) {
					conditionType = "Date";
					conditionValue = expireDate;
				} else if (iaTransitionDate !== undefined) {
					conditionType = "Date";
					conditionValue = iaTransitionDate;
				} else {
					conditionValue = await prompt(
						`Enter the number of days or a date (YYYY-MM-DD) after which to ${formatActionDescription(action)}`
					);
					if (
						!isNonNegativeNumber(String(conditionValue)) &&
						!isValidDate(String(conditionValue))
					) {
						throw new UserError(
							"Must be a positive number or a valid date in the YYYY-MM-DD format."
						);
					}
				}

				if (isNonNegativeNumber(String(conditionValue))) {
					conditionType = "Age";
					conditionValue = Number(conditionValue) * 86400; // Convert days to seconds
				} else if (isValidDate(String(conditionValue))) {
					conditionType = "Date";
					const date = new Date(`${conditionValue}T00:00:00.000Z`);
					conditionValue = date.toISOString();
				} else {
					throw new UserError("Invalid condition input.");
				}

				if (action === "expire") {
					newRule.deleteObjectsTransition = {
						condition: {
							[conditionType === "Age" ? "maxAge" : "date"]: conditionValue,
							type: conditionType,
						},
					};
				} else if (action === "transition") {
					newRule.storageClassTransitions = [
						{
							condition: {
								[conditionType === "Age" ? "maxAge" : "date"]: conditionValue,
								type: conditionType,
							},
							storageClass: "InfrequentAccess",
						},
					];
				}
			}
		}

		if (!prefix && !force) {
			const confirmedAdd = await confirm(
				`Are you sure you want to add lifecycle rule '${name}' to bucket '${bucket}' without a prefix? ` +
					`The lifecycle rule will apply to all objects in your bucket.`
			);
			if (!confirmedAdd) {
				logger.log("Add cancelled.");
				return;
			}
		}

		if (prefix) {
			newRule.conditions.prefix = prefix;
		}

		lifecycleRules.push(newRule);
		logger.log(`Adding lifecycle rule '${name}' to bucket '${bucket}'...`);
		await putLifecycleRules(
			config,
			accountId,
			bucket,
			lifecycleRules,
			jurisdiction
		);
		logger.log(`✨ Added lifecycle rule '${name}' to bucket '${bucket}'.`);
	},
});

export const r2BucketLifecycleRemoveCommand = createCommand({
	metadata: {
		description: "Remove a lifecycle rule from an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the R2 bucket to remove a lifecycle rule from",
			type: "string",
			demandOption: true,
		},
		name: {
			describe: "The unique name of the lifecycle rule to remove",
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

		const lifecycleRules = await getLifecycleRules(
			config,
			accountId,
			bucket,
			jurisdiction
		);

		const index = lifecycleRules.findIndex((rule) => rule.id === name);

		if (index === -1) {
			throw new UserError(
				`Lifecycle rule with ID '${name}' not found in configuration for '${bucket}'.`
			);
		}

		lifecycleRules.splice(index, 1);

		logger.log(`Removing lifecycle rule '${name}' from bucket '${bucket}'...`);
		await putLifecycleRules(
			config,
			accountId,
			bucket,
			lifecycleRules,
			jurisdiction
		);
		logger.log(`Lifecycle rule '${name}' removed from bucket '${bucket}'.`);
	},
});

export const r2BucketLifecycleSetCommand = createCommand({
	metadata: {
		description:
			"Set the lifecycle configuration for an R2 bucket from a JSON file",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the R2 bucket to set lifecycle configuration for",
			type: "string",
			demandOption: true,
		},
		file: {
			describe: "Path to the JSON file containing lifecycle configuration",
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
		let lifecyclePolicy: { rules: LifecycleRule[] };
		try {
			lifecyclePolicy = JSON.parse(readFileSync(file));
		} catch (e) {
			if (e instanceof Error) {
				throw new UserError(
					`Failed to read or parse the lifecycle configuration config file: '${e.message}'`
				);
			} else {
				throw e;
			}
		}

		if (!lifecyclePolicy.rules || !Array.isArray(lifecyclePolicy.rules)) {
			throw new UserError(
				"The lifecycle configuration file must contain a 'rules' array."
			);
		}

		if (!force) {
			const confirmedRemoval = await confirm(
				`Are you sure you want to overwrite all existing lifecycle rules for bucket '${bucket}'?`
			);
			if (!confirmedRemoval) {
				logger.log("Set cancelled.");
				return;
			}
		}
		logger.log(
			`Setting lifecycle configuration (${lifecyclePolicy.rules.length} rules) for bucket '${bucket}'...`
		);
		await putLifecycleRules(
			config,
			accountId,
			bucket,
			lifecyclePolicy.rules,
			jurisdiction
		);
		logger.log(`✨ Set lifecycle configuration for bucket '${bucket}'.`);
	},
});
