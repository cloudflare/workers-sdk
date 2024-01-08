import assert from "assert";
import path from "path";
import { fetchResult } from "./cfetch";
import { findWranglerToml, readConfig } from "./config";
import { confirm } from "./dialogs";
import { deleteKVNamespace, listKVNamespaces } from "./kv/helpers";
import { logger } from "./logger";
import * as metrics from "./metrics";
import { requireAuth } from "./user";
import { getScriptName, printWranglerBanner } from "./index";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "./yargs-types";

// Types returned by the /script/{name}/references API
type ServiceReference = {
	name: string;
	service: string;
	environment: string;
};

type DurableObjectServiceReference = ServiceReference & {
	durable_object_namespace_id: string;
	durable_object_namespace_name: string;
};

type DispatchOutboundsServiceReference = ServiceReference & {
	namespace: string;
	params: { name: string }[];
};

export type ServiceReferenceResponse = {
	services?: {
		incoming: ServiceReference[];
		outgoing: ServiceReference[];
	};
	durable_objects?: DurableObjectServiceReference[];
	dispatch_outbounds?: DispatchOutboundsServiceReference[];
};

// Types returned by the /tails/by-consumer/{name} API
export type Tail = {
	tag: string;
	producer:
		| {
				service: string;
				environment?: string;
		  }
		| { script: string };
	consumer:
		| {
				service: string;
				environment?: string;
		  }
		| { script: string };
	log_push?: boolean;
	config?: unknown;
	created_on: string;
	modified_on: string;
};

export function deleteOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("script", {
			describe: "The path to an entry point for your worker",
			type: "string",
			requiresArg: true,
		})
		.option("name", {
			describe: "Name of the worker",
			type: "string",
			requiresArg: true,
		})
		.option("dry-run", {
			describe: "Don't actually delete",
			type: "boolean",
		})
		.option("force", {
			describe:
				"Delete even if doing so will break other Workers that depend on this one",
			type: "boolean",
		})
		.option("legacy-env", {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
		});
}

type DeleteArgs = StrictYargsOptionsToInterface<typeof deleteOptions>;

export async function deleteHandler(args: DeleteArgs) {
	await printWranglerBanner();

	const configPath =
		args.config || (args.script && findWranglerToml(path.dirname(args.script)));
	const config = readConfig(configPath, args);
	await metrics.sendMetricsEvent(
		"delete worker script",
		{},
		{ sendMetrics: config.send_metrics }
	);

	const accountId = args.dryRun ? undefined : await requireAuth(config);

	const scriptName = getScriptName(args, config);

	assert(
		scriptName,
		"A worker name must be defined, either via --name, or in wrangler.toml"
	);

	if (args.dryRun) {
		logger.log(`--dry-run: exiting now.`);
		return;
	}

	assert(accountId, "Missing accountId");

	const confirmed =
		args.force ||
		(await confirm(
			`Are you sure you want to delete ${scriptName}? This action cannot be undone.`
		));

	if (confirmed) {
		const needsForceDelete =
			args.force ||
			(await checkAndConfirmForceDeleteIfNecessary(scriptName, accountId));
		if (needsForceDelete === null) {
			// null means the user rejected the extra confirmation - return early
			return;
		}

		await fetchResult(
			`/accounts/${accountId}/workers/services/${scriptName}`,
			{ method: "DELETE" },
			new URLSearchParams({ force: needsForceDelete.toString() })
		);

		await deleteSiteNamespaceIfExisting(scriptName, accountId);

		logger.log("Successfully deleted", scriptName);
	}
}

async function deleteSiteNamespaceIfExisting(
	scriptName: string,
	accountId: string
): Promise<void> {
	const title = `__${scriptName}-workers_sites_assets`;
	const previewTitle = `__${scriptName}-workers_sites_assets_preview`;
	const allNamespaces = await listKVNamespaces(accountId);
	const namespacesToDelete = allNamespaces.filter(
		(ns) => ns.title === title || ns.title === previewTitle
	);
	for (const ns of namespacesToDelete) {
		await deleteKVNamespace(accountId, ns.id);
		logger.log(`🌀 Deleted asset namespace for Workers Site "${ns.title}"`);
	}
}

type ScriptDetails =
	| {
			service: string;
			environment?: string;
	  }
	| {
			script: string;
	  };

function renderScriptName<T extends ScriptDetails = ScriptDetails>(details: T) {
	let service: string;
	let environment: string | undefined;
	if ("script" in details) {
		service = details.script;
	} else {
		service = details.service;
		environment = details.environment;
	}
	return environment ? `${service} (${environment})` : service;
}

function isUsedAsServiceBinding(references: ServiceReferenceResponse) {
	return (references.services?.incoming.length || 0) > 0;
}

function isUsedAsDurableObjectNamespace(
	references: ServiceReferenceResponse,
	scriptName: string
) {
	return (
		(references.durable_objects?.filter((ref) => ref.service !== scriptName)
			?.length || 0) > 0
	);
}

function isUsedAsDispatchOutbound(references: ServiceReferenceResponse) {
	return references.dispatch_outbounds?.length || 0;
}

function isUsedAsTailConsumer(tailProducers: Tail[]) {
	return tailProducers.length > 0;
}

async function checkAndConfirmForceDeleteIfNecessary(
	scriptName: string,
	accountId: string
): Promise<boolean | null> {
	const references = await fetchResult<ServiceReferenceResponse>(
		`/accounts/${accountId}/workers/scripts/${scriptName}/references`
	);
	const tailProducers = await fetchResult<Tail[]>(
		`/accounts/${accountId}/workers/tails/by-consumer/${scriptName}`
	);
	const isDependentService =
		isUsedAsServiceBinding(references) ||
		isUsedAsDurableObjectNamespace(references, scriptName) ||
		isUsedAsDispatchOutbound(references) ||
		isUsedAsTailConsumer(tailProducers);
	if (!isDependentService) return false;

	const dependentMessages: string[] = [];
	for (const serviceBindingReference of references.services?.incoming || []) {
		const dependentScript = renderScriptName(serviceBindingReference);
		dependentMessages.push(
			`- Worker ${dependentScript} uses this Worker as a Service Binding`
		);
	}
	for (const implementedDOBindingReference of references.durable_objects ||
		[]) {
		if (implementedDOBindingReference.service === scriptName) continue;
		const dependentScript = renderScriptName(implementedDOBindingReference);
		dependentMessages.push(
			`- Worker ${dependentScript} has a binding to the Durable Object Namespace "${implementedDOBindingReference.durable_object_namespace_name}" implemented by this Worker`
		);
	}
	for (const dispatchNamespaceOutboundReference of references.dispatch_outbounds ||
		[]) {
		const dependentScript = renderScriptName(
			dispatchNamespaceOutboundReference
		);
		dependentMessages.push(
			`- Worker ${dependentScript} uses this Worker as an Outbound Worker for the Dynamic Dispatch Namespace "${dispatchNamespaceOutboundReference.namespace}"`
		);
	}
	for (const consumingTail of tailProducers) {
		const dependentScript = renderScriptName(consumingTail.producer);
		dependentMessages.push(
			`- Worker ${dependentScript} uses this Worker as a Tail Worker`
		);
	}
	const extraConfirmed =
		await confirm(`${scriptName} is currently in use by other Workers:

${dependentMessages.join("\n")}

You can still delete this Worker, but doing so WILL BREAK the Workers that depend on it. This will cause unexpected failures, and cannot be undone.
Are you sure you want to continue?`);

	return extraConfirmed ? true : null;
}
