import { logRaw } from "@cloudflare/cli";
import { convertBindingsToCfWorkerInitBindings } from "../api/startDevWorker/utils";
import { createCommand } from "../core/create-command";
import { UserError } from "../errors";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { printBindings } from "../utils/print-bindings";
import formatLabelledValues from "../utils/render-labelled-values";
import { fetchVersion } from "./api";
import { getVersionSource } from "./list";

const BLANK_INPUT = "-"; // To be used where optional user-input is displayed and the value is nullish

export const versionsViewCommand = createCommand({
	metadata: {
		description: "View the details of a specific version of your Worker",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		"version-id": {
			describe: "The Worker Version ID to view",
			type: "string",
			requiresArg: true,
			demandOption: true,
		},
		name: {
			describe: "Name of the worker",
			type: "string",
			requiresArg: true,
		},
		json: {
			describe: "Display output as clean JSON",
			type: "boolean",
			default: false,
		},
	},
	positionalArgs: ["version-id"],
	async handler(args, { config }) {
		metrics.sendMetricsEvent(
			"view worker version",
			{},
			{
				sendMetrics: config.send_metrics,
			}
		);

		const accountId = await requireAuth(config);
		const workerName = args.name ?? config.name;

		if (workerName === undefined) {
			throw new UserError(
				'You need to provide a name of your worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`',
				{ telemetryMessage: true }
			);
		}

		const version = await fetchVersion(
			config,
			accountId,
			workerName,
			args.versionId
		);

		if (args.json) {
			logRaw(JSON.stringify(version, null, 2));
			return;
		}

		logRaw(
			formatLabelledValues({
				"Version ID": version.id,
				Created: new Date(version.metadata["created_on"]).toISOString(),
				Author: version.metadata.author_email,
				Source: getVersionSource(version),
				Tag: version.annotations?.["workers/tag"] || BLANK_INPUT,
				Message: version.annotations?.["workers/message"] || BLANK_INPUT,
			})
		);
		const scriptInfo: ScriptInfoLog = {};
		if (version.resources.script.handlers) {
			scriptInfo.Handlers = version.resources.script.handlers.join(", ");
		}
		if (version.resources.script_runtime.compatibility_date) {
			scriptInfo["Compatibility Date"] =
				version.resources.script_runtime.compatibility_date;
		}
		if (version.resources.script_runtime.compatibility_flags) {
			scriptInfo["Compatibility Flags"] =
				version.resources.script_runtime.compatibility_flags.join(", ");
		}
		if (Object.keys(scriptInfo).length > 0) {
			logRaw("");
			logRaw(formatLabelledValues(scriptInfo));
		}

		const secrets = version.resources.bindings.filter(
			(binding) => binding.type === "secret_text"
		);
		if (secrets.length > 0) {
			logRaw("Secrets:");
			for (const secret of secrets) {
				logRaw(
					formatLabelledValues({
						"Secret Name": secret.name,
					})
				);
			}
		}

		const bindings = version.resources.bindings.filter(
			(binding) => binding.type !== "secret_text"
		);
		if (bindings.length > 0) {
			printBindings(
				(await convertBindingsToCfWorkerInitBindings(bindings)).bindings
			);
		}
	},
});

type ScriptInfoLog = {
	Handlers?: string;
	"Compatibility Date"?: string;
	"Compatibility Flags"?: string;
};
