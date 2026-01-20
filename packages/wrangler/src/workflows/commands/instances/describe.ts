import { logRaw } from "@cloudflare/cli";
import { red, white } from "@cloudflare/cli/colors";
import {
	addMilliseconds,
	formatDistanceStrict,
	formatDistanceToNowStrict,
} from "date-fns";
import { ms } from "itty-time";
import { fetchResult } from "../../../cfetch";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import formatLabelledValues from "../../../utils/render-labelled-values";
import {
	emojifyInstanceStatus,
	emojifyInstanceTriggerName,
	emojifyStepType,
	getInstanceIdFromArgs,
} from "../../utils";
import type {
	InstanceSleepLog,
	InstanceStatusAndLogs,
	InstanceStepLog,
	InstanceTerminateLog,
	InstanceWaitForEventLog,
} from "../../types";

export const workflowsInstancesDescribeCommand = createCommand({
	metadata: {
		description:
			"Describe a workflow instance - see its logs, retries and errors",
		owner: "Product: Workflows",
		status: "stable",
		logArgs: true,
	},

	positionalArgs: ["name", "id"],
	args: {
		name: {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		},
		id: {
			describe:
				"ID of the instance - instead of an UUID you can type 'latest' to get the latest instance and describe it",
			type: "string",
			demandOption: false,
			default: "latest",
		},
		"step-output": {
			describe:
				"Don't output the step output since it might clutter the terminal",
			type: "boolean",
			default: true,
		},
		"truncate-output-limit": {
			describe: "Truncate step output after x characters",
			type: "number",
			default: 5000,
		},
	},

	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		const id = await getInstanceIdFromArgs(accountId, args, config);

		const instance = await fetchResult<InstanceStatusAndLogs>(
			config,
			`/accounts/${accountId}/workflows/${args.name}/instances/${id}`
		);

		const formattedInstance: Record<string, string> = {
			"Workflow Name": args.name,
			"Instance Id": id,
			"Version Id": instance.versionId,
			Status: emojifyInstanceStatus(instance.status),
			Trigger: emojifyInstanceTriggerName(instance.trigger.source),
			Queued: new Date(instance.queued).toLocaleString(),
		};

		if (instance.success != null) {
			formattedInstance.Success = instance.success ? "✅ Yes" : "❌ No";
		}

		// date related stuff, if the workflow is still running assume duration until now
		if (instance.start != undefined) {
			formattedInstance.Start = new Date(instance.start).toLocaleString();
		}

		if (instance.end != undefined) {
			formattedInstance.End = new Date(instance.end).toLocaleString();
		}

		if (instance.start != null && instance.end != null) {
			formattedInstance.Duration = formatDistanceStrict(
				new Date(instance.end),
				new Date(instance.start)
			);
		} else if (instance.start != null) {
			// Convert current date to UTC
			formattedInstance.Duration = formatDistanceStrict(
				new Date(instance.start),
				new Date(new Date().toUTCString().slice(0, -4))
			);
		}

		const lastSuccessfulStepName = getLastSuccessfulStep(instance);
		if (lastSuccessfulStepName != null) {
			formattedInstance["Last Successful Step"] = lastSuccessfulStepName;
		}

		// display the error if the instance errored out
		if (instance.error != null) {
			formattedInstance.Error = red(
				`${instance.error.name}: ${instance.error.message}`
			);
		}

		logRaw("Describing latest instance:");
		logRaw(formatLabelledValues(formattedInstance));
		logRaw(white("Steps:"));

		instance.steps.forEach(logStep.bind(false, args));
	},
});

function logStep(
	args: typeof workflowsInstancesDescribeCommand.args,
	step:
		| InstanceStepLog
		| InstanceSleepLog
		| InstanceTerminateLog
		| InstanceWaitForEventLog
) {
	logRaw("");
	const formattedStep: Record<string, string> = {};

	if (
		step.type == "sleep" ||
		step.type == "step" ||
		step.type == "waitForEvent"
	) {
		formattedStep.Name = step.name;
		formattedStep.Type = emojifyStepType(step.type);

		// date related stuff, if the step is still running assume duration until now
		if (step.start != undefined) {
			formattedStep.Start = new Date(step.start).toLocaleString();
		}

		if (step.end != undefined) {
			formattedStep.End = new Date(step.end).toLocaleString();
		}

		if (step.start != null && step.end != null) {
			formattedStep.Duration = formatDistanceStrict(
				new Date(step.end),
				new Date(step.start)
			);
		} else if (step.start != null) {
			// Convert current date to UTC
			formattedStep.Duration = formatDistanceStrict(
				new Date(step.start),
				new Date(new Date().toUTCString().slice(0, -4))
			);
		}
	} else if (step.type == "termination") {
		formattedStep.Type = emojifyStepType(step.type);
		formattedStep.Trigger = step.trigger.source;
	}

	if (step.type == "step") {
		if (step.success !== null) {
			formattedStep.Success = step.success ? "✅ Yes" : "❌ No";
		} else {
			formattedStep.Success = "▶ Running";
		}

		if (step.success === null) {
			const latestAttempt = step.attempts.at(-1);
			let delay = step.config.retries.delay;
			if (latestAttempt !== undefined && latestAttempt.success === false) {
				// SAFETY: It's okay because end date must always exist in the API, otherwise it's okay to fail
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const endDate = new Date(latestAttempt.end!);
				if (typeof delay === "string") {
					delay = ms(delay);
				}
				const retryDate = addMilliseconds(endDate, delay);
				formattedStep["Retries At"] =
					`${retryDate.toLocaleString()} (in ${formatDistanceToNowStrict(retryDate)} from now)`;
			}
		}
	}

	if (step.type == "step" || step.type == "waitForEvent") {
		if (step.output !== undefined && args.stepOutput) {
			let output: string;
			try {
				output = JSON.stringify(step.output);
			} catch {
				output = step.output as string;
			}
			formattedStep.Output =
				output.length > args.truncateOutputLimit
					? output.substring(0, args.truncateOutputLimit) +
						"[...output truncated]"
					: output;
		}
	}

	logger.log(formatLabelledValues(formattedStep, { indentationCount: 2 }));

	if (step.type == "step") {
		const prettyAttempts = step.attempts.map((val) => {
			const attempt: Record<string, string> = {};

			attempt.Start = new Date(val.start).toLocaleString();
			attempt.End = val.end == null ? "" : new Date(val.end).toLocaleString();

			if (val.start != null && val.end != null) {
				attempt.Duration = formatDistanceStrict(
					new Date(val.end),
					new Date(val.start)
				);
			} else if (val.start != null) {
				// Converting datetimes into UTC is very cool in JS
				attempt.Duration = formatDistanceStrict(
					new Date(val.start),
					new Date(new Date().toUTCString().slice(0, -4))
				);
			}

			attempt.State =
				val.success == null
					? "🔄 Working"
					: val.success
						? "✅ Success"
						: "❌ Error";

			// This is actually safe to do while logger.table only considers the first element as keys.
			// Because if there's an error, the first row will always be an error
			if (val.error != null) {
				attempt.Error = red(`${val.error.name}: ${val.error.message}`);
			}
			return attempt;
		});

		logger.table(prettyAttempts);
	}
}

function getLastSuccessfulStep(logs: InstanceStatusAndLogs): string | null {
	let lastSuccessfulStepName: string | null = null;

	for (const step of logs.steps) {
		switch (step.type) {
			case "step":
				if (step.success == true) {
					lastSuccessfulStepName = step.name;
				}
				break;
			case "sleep":
				if (step.end != null) {
					lastSuccessfulStepName = step.name;
				}
				break;
			case "termination":
				break;
		}
	}

	return lastSuccessfulStepName;
}
