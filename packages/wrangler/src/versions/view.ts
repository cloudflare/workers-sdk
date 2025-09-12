import { logRaw } from "@cloudflare/cli";
import { createCommand } from "../core/create-command";
import { UserError } from "../errors";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import formatLabelledValues from "../utils/render-labelled-values";
import { fetchVersion } from "./api";
import { getVersionSource } from "./list";
import type { WorkerMetadataBinding } from "../deployment-bundle/create-worker-upload-form";

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
	handler: async function versionsViewHandler(args, { config }) {
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
			logRaw("------------------------------------------------------------");
			logRaw(formatLabelledValues(scriptInfo));
		}

		const secrets = version.resources.bindings.filter(
			(binding) => binding.type === "secret_text"
		);
		if (secrets.length > 0) {
			logRaw("------------------------- secrets  -------------------------");
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
			logRaw("------------------------- bindings -------------------------");
			// env vars are done differently so target them first
			const envVars = bindings.filter(
				(binding) => binding.type === "plain_text"
			);
			if (envVars.length > 0) {
				logRaw(
					`[vars]\n` +
						// ts is having issues typing from the filter
						(envVars as { type: "plain_text"; name: string; text: string }[])
							.map((envVar) => `${envVar.name} = "${envVar.text}"`)
							.join("\n")
				);
			}

			// Filter out env vars since they got handled above
			const restOfBindings = bindings.filter(
				(binding) => binding.type !== "plain_text"
			);
			for (const binding of restOfBindings) {
				const output = printBindingAsToml(binding);
				if (output !== null) {
					logRaw(output);
					logRaw("");
				}
			}
		}
	},
});

type ScriptInfoLog = {
	Handlers?: string;
	"Compatibility Date"?: string;
	"Compatibility Flags"?: string;
};

function printBindingAsToml(binding: WorkerMetadataBinding) {
	switch (binding.type) {
		case "ai":
			return "[ai]" + `\nbinding = ${binding.name}`;

		case "analytics_engine":
			return (
				"[[analytics_engine_datasets]]" +
				`\nbinding = ${binding.name}` +
				(binding.dataset ? `\ndataset = ${binding.dataset}` : "")
			);

		case "browser":
			return "[browser]" + `\nbinding = "${binding.name}"`;

		case "d1":
			return (
				"[[d1_databases]]" +
				`\nbinding = "${binding.name}"` +
				`\ndatabase_id = "${binding.id}"`
			);

		case "dispatch_namespace":
			return (
				"[[dispatch_namespaces]]" +
				`\nbinding = "${binding.name}"` +
				`\nnamespce = "${binding.namespace}"` +
				(binding.outbound
					? `\noutbound = { service = "${binding.outbound.worker.service}"` +
						(binding.outbound.params
							? `, parameters = [${binding.outbound.params.map((param) => param.name).join(", ")}]`
							: "") +
						" }"
					: "")
			);

		case "durable_object_namespace":
			return (
				"[[durable_objects.bindings]]" +
				`\nname = "${binding.name}"` +
				`\nclass_name = "${binding.class_name}"` +
				(binding.script_name ? `\nscript_name = "${binding.script_name}"` : "")
			);

		case "hyperdrive":
			return (
				"[[hyperdrive]]" +
				`\nbinding = "${binding.name}"` +
				`\nid = "${binding.id}"`
			);

		case "kv_namespace":
			return (
				"[[kv_namespaces]]" +
				`\nbinding = "${binding.name}"` +
				`\nid = "${binding.namespace_id}"`
			);

		case "mtls_certificate":
			return (
				"[[mtls_certificates]]" +
				`\nbinding = "${binding.name}"` +
				`\ncertificate_id = "${binding.certificate_id}"`
			);

		case "queue":
			return (
				"[[queues.producers]]" +
				`\nbinding = "${binding.name}"` +
				`\nqueue = "${binding.queue_name}"` +
				(binding.delivery_delay
					? `\ndelivery_delay = ${binding.delivery_delay}`
					: "")
			);

		case "r2_bucket":
			return (
				"[[r2_buckets]]" +
				`\nbinding = "${binding.name}"` +
				`\nbucket_name = "${binding.bucket_name}"` +
				(binding.jurisdiction
					? `\njurisdiction = "${binding.jurisdiction}"`
					: "")
			);

		case "send_email":
			return (
				"[[send_email]]" +
				`\nname = "${binding.name}"` +
				(binding.destination_address
					? `\ndestination_address = "${binding.destination_address}"`
					: "") +
				(binding.allowed_destination_addresses
					? `\nallowed_destination_addresses = [${binding.allowed_destination_addresses.map((addr) => `"${addr}"`).join(", ")}]`
					: "") +
				(binding.allowed_sender_addresses
					? `\nallowed_sender_addresses = [${binding.allowed_sender_addresses.map((addr) => `"${addr}"`).join(", ")}]`
					: "")
			);

		case "service":
			return (
				"[[services]]" +
				`\nbinding = "${binding.name}"` +
				`\nservice = "${binding.name}"` +
				(binding.entrypoint ? `\nentrypoint = "${binding.entrypoint}"` : "")
			);

		case "vectorize":
			return (
				"[[vectorize]]" +
				`\nbinding = "${binding.name}"` +
				`\nindex_name = "${binding.index_name}"`
			);

		case "version_metadata":
			return "[version_metadata]" + `\nbinding = "${binding.name}"`;

		default:
			return null;
	}
}
