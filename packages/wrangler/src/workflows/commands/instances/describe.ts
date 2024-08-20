import { logRaw } from "@cloudflare/cli";
import { red, white } from "@cloudflare/cli/colors";
import { formatDistanceStrict, formatDistanceToNowStrict } from "date-fns";
import { fetchResult } from "../../../cfetch";
import { readConfig } from "../../../config";
import { logger } from "../../../logger";
import { printWranglerBanner } from "../../../update-check";
import { requireAuth } from "../../../user";
import formatLabelledValues from "../../../utils/render-labelled-values";
import {
	emojifyInstanceStatus,
	emojifyInstanceTriggerName,
	emojifyStepType,
} from "../../utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../../yargs-types";
import type {
	Instance,
	InstanceSleepLog,
	InstanceStatusAndLogs,
	InstanceStepLog,
	InstanceTerminateLog,
} from "../../types";

export const instancesDescribeOptions = (args: CommonYargsArgv) => {
	return args
		.positional("name", {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		})
		.positional("id", {
			describe:
				"ID of the instance - instead of an UUID you can type 'latest' to get the latest instance and describe it",
			type: "string",
			demandOption: true,
		})
		.option("step-output", {
			describe:
				"Don't output the step output since it might clutter the terminal",
			type: "boolean",
			default: true,
		})
		.option("truncate-output-limit", {
			describe: "Truncate step output after x characters",
			type: "number",
			default: 5000,
		});
};

type HandlerOptions = StrictYargsOptionsToInterface<
	typeof instancesDescribeOptions
>;

export const instancesDescribeHandler = async (args: HandlerOptions) => {
	await printWranglerBanner();

	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	let id = args.id;

	if (id == "latest") {
		const instances = (
			await fetchResult<Instance[]>(
				`/accounts/${accountId}/workflows/${args.name}/instances`
			)
		).sort((a, b) => b.created_on.localeCompare(a.created_on));

		if (instances.length == 0) {
			logger.error(
				`There are no deployed instances in workflow "${args.name}".`
			);
			return;
		}

		id = instances[0].id;
	}

	const instance = await fetchResult<InstanceStatusAndLogs>(
		`/accounts/${accountId}/workflows/${args.name}/instances/${id}`
	);

	const formattedInstance: Record<string, string> = {
		"Instance Name": args.name,
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

	if (instance.start != undefined && instance.end != undefined) {
		formattedInstance.Duration = formatDistanceStrict(
			new Date(instance.end),
			new Date(instance.start)
		);
	} else if (instance.start != undefined) {
		formattedInstance.Duration = formatDistanceToNowStrict(
			new Date(instance.start)
		);
	}

	// display the error if the instance errored out
	if (instance.error != null) {
		formattedInstance.Error = red(
			`${instance.error.name}: ${instance.error.message}`
		);
	}

	logRaw(formatLabelledValues(formattedInstance));
	logRaw(white("Steps:"));

	instance.steps.forEach(logStep.bind(false, args));
};

const logStep = (
	args: HandlerOptions,
	step: InstanceStepLog | InstanceSleepLog | InstanceTerminateLog
) => {
	logRaw("");
	const formattedInstance: Record<string, string> = {};

	if (step.type == "sleep" || step.type == "step") {
		formattedInstance.Name = step.name;
		formattedInstance.Type = emojifyStepType(step.type);

		// date related stuff, if the step is still running assume duration until now
		if (step.start != undefined) {
			formattedInstance.Start = new Date(step.start).toLocaleString();
		}

		if (step.end != undefined) {
			formattedInstance.End = new Date(step.end).toLocaleString();
		}

		if (step.start != undefined && step.end != undefined) {
			formattedInstance.Duration = formatDistanceStrict(
				new Date(step.end),
				new Date(step.start)
			);
		} else if (step.start != undefined) {
			formattedInstance.Duration = formatDistanceToNowStrict(
				new Date(step.start)
			);
		}
	} else if (step.type == "termination") {
		formattedInstance.Type = emojifyStepType(step.type);
		formattedInstance.Trigger = step.trigger.source;
	}

	if (step.type == "step") {
		formattedInstance.Success = step.success ? "✅ Yes" : "❌ No";
		if (step.output !== undefined && args.stepOutput) {
			let output: string;
			try {
				output = JSON.stringify(step.output);
			} catch {
				output = step.output as string;
			}
			formattedInstance.Output =
				output.length > args.truncateOutputLimit
					? output.substring(0, args.truncateOutputLimit) +
						"[...output truncated]"
					: output;
		}
	}

	logRaw(formatLabelledValues(formattedInstance, { indentationCount: 2 }));

	if (step.type == "step") {
		const prettyAttempts = step.attempts.map((val) => {
			const attempt: Record<string, string> = {};

			attempt.Start = new Date(val.start).toLocaleString();
			attempt.End = val.end == null ? "" : new Date(val.end).toLocaleString();

			if (val.start != undefined && val.end != undefined) {
				attempt.Duration = formatDistanceStrict(
					new Date(val.end),
					new Date(val.start)
				);
			} else if (attempt.start != undefined) {
				attempt.Duration = formatDistanceToNowStrict(new Date(val.start));
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
};
