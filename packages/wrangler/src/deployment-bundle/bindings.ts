import assert from "node:assert";
import { UserError } from "@cloudflare/workers-utils";
import { convertConfigToBindings } from "../api/startDevWorker/utils";
import { fetchResult } from "../cfetch";
import { prompt, search } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { printBindings } from "../utils/print-bindings";
import { useServiceEnvironments } from "../utils/useServiceEnvironments";
import { AISearchNamespaceHandler } from "./provision/ai-search";
import { D1Handler } from "./provision/d1";
import { DispatchNamespaceHandler } from "./provision/dispatch-namespace";
import { HyperdriveHandler } from "./provision/hyperdrive";
import {
	generateDefaultName,
	type NormalisedResourceInfo,
	type ProvisionableBinding,
	type Settings,
} from "./provision/index";
import { KVHandler } from "./provision/kv";
import { MtlsCertificateHandler } from "./provision/mtls-certificate";
import { PipelineHandler } from "./provision/pipeline";
import { QueueHandler } from "./provision/queue";
import { R2Handler } from "./provision/r2";
import { VectorizeHandler } from "./provision/vectorize";
import { VpcServiceHandler } from "./provision/vpc-service";
import type { Binding, StartDevWorkerInput } from "../api/startDevWorker/types";
import type {
	HandlerStatics,
	ProvisionResourceHandler,
} from "./provision/index";
import type { Config, WorkerMetadataBinding } from "@cloudflare/workers-utils";

export type { Settings } from "./provision/index";

export function getBindings(
	config: Config | undefined,
	options?: {
		pages?: boolean;
	}
): NonNullable<StartDevWorkerInput["bindings"]> {
	if (!config) {
		return {};
	}
	return convertConfigToBindings(config, {
		usePreviewIds: false,
		pages: options?.pages,
	});
}

const HANDLERS: Record<string, HandlerStatics> = {
	[KVHandler.bindingType]: KVHandler,
	[D1Handler.bindingType]: D1Handler,
	[R2Handler.bindingType]: R2Handler,
	[AISearchNamespaceHandler.bindingType]: AISearchNamespaceHandler,
	[QueueHandler.bindingType]: QueueHandler,
	[DispatchNamespaceHandler.bindingType]: DispatchNamespaceHandler,
	[VectorizeHandler.bindingType]: VectorizeHandler,
	[HyperdriveHandler.bindingType]: HyperdriveHandler,
	[PipelineHandler.bindingType]: PipelineHandler,
	[VpcServiceHandler.bindingType]: VpcServiceHandler,
	[MtlsCertificateHandler.bindingType]: MtlsCertificateHandler,
};

type PendingResource = {
	binding: string;
	resourceType: string;
	handler: ProvisionResourceHandler<
		WorkerMetadataBinding["type"],
		ProvisionableBinding
	>;
};

function isProvisionableBinding(
	binding: Binding
): binding is ProvisionableBinding {
	return binding.type in HANDLERS;
}

function createHandler(
	bindingName: string,
	binding: ProvisionableBinding,
	config: Config,
	accountId: string
): ProvisionResourceHandler<
	WorkerMetadataBinding["type"],
	ProvisionableBinding
> {
	return HANDLERS[binding.type].create(bindingName, binding, config, accountId);
}

async function collectPendingResources(
	config: Config,
	accountId: string,
	scriptName: string,
	bindings: StartDevWorkerInput["bindings"],
	requireRemote: boolean
): Promise<PendingResource[]> {
	let settings: Settings | undefined;

	try {
		settings = await getSettings(config, accountId, scriptName);
	} catch {
		logger.debug("No settings found");
	}

	const pendingResources: PendingResource[] = [];

	for (const [bindingName, binding] of Object.entries(bindings ?? {})) {
		if (!isProvisionableBinding(binding)) {
			continue;
		}

		if (requireRemote && !("remote" in binding && binding.remote)) {
			continue;
		}

		const h = createHandler(bindingName, binding, config, accountId);

		if (await h.shouldProvision(settings)) {
			pendingResources.push({
				binding: bindingName,
				resourceType: binding.type,
				handler: h,
			});
		}
	}

	// Sort by the order handlers appear in the HANDLERS registry
	const handlerOrder = Object.keys(HANDLERS);
	return pendingResources.sort(
		(a, b) =>
			handlerOrder.indexOf(a.resourceType) -
			handlerOrder.indexOf(b.resourceType)
	);
}

export function getSettings(
	config: Config,
	accountId: string,
	scriptName: string
) {
	return fetchResult<Settings>(
		config,
		`/accounts/${accountId}/workers/scripts/${scriptName}/settings`
	);
}

export async function provisionBindings(
	bindings: StartDevWorkerInput["bindings"],
	accountId: string,
	scriptName: string,
	config: Config,
	requireRemote = false
): Promise<void> {
	const configPath = config.userConfigPath ?? config.configPath;
	const pendingResources = await collectPendingResources(
		config,
		accountId,
		scriptName,
		bindings,
		requireRemote
	);

	if (pendingResources.length === 0) {
		return;
	}

	assert(
		configPath,
		"Provisioning resources is not possible without a config file"
	);

	if (useServiceEnvironments(config)) {
		throw new UserError(
			"Provisioning resources is not supported with a service environment"
		);
	}
	logger.log();

	printBindings(
		Object.fromEntries(
			pendingResources.map((r) => [r.binding, { type: r.resourceType }])
		) as Record<string, Binding>,
		config.tail_consumers,
		config.streaming_tail_consumers,
		config.containers,
		{ provisioning: true }
	);
	logger.log();

	// Pre-flight: identify any bindings that will fail BEFORE creating anything.
	// This avoids orphaned resources when some bindings can auto-provision but others can't.
	if (isNonInteractiveOrCI()) {
		const blocked = pendingResources.filter(
			(r) => !r.handler.name && !r.handler.ciSafe
		);
		if (blocked.length > 0) {
			const provisionable = pendingResources.filter(
				(r) => r.handler.name || r.handler.ciSafe
			);
			reportProvisioningFailures(
				blocked.map((r) => ({
					binding: r.binding,
					type: r.resourceType,
					friendlyName: HANDLERS[r.resourceType].friendlyName,
					hint:
						r.handler.provisioningHint ??
						"Provide the resource ID in your configuration file.",
				})),
				provisionable.map((r) => ({
					binding: r.binding,
					friendlyName: HANDLERS[r.resourceType].friendlyName,
				}))
			);
		}
	}

	const existingResources: Record<string, NormalisedResourceInfo[]> = {};
	const created: Array<{
		binding: string;
		friendlyName: string;
		idField: string;
		id: unknown;
	}> = [];

	try {
		for (const resource of pendingResources) {
			existingResources[resource.resourceType] ??= await HANDLERS[
				resource.resourceType
			].load(config, accountId);

			await runProvisioningFlow(
				resource,
				existingResources[resource.resourceType],
				HANDLERS[resource.resourceType].friendlyName,
				scriptName
			);

			// runProvisioningFlow completed — record the now-populated id so we
			// can tell the user about it if a later resource fails.
			const idField = resource.handler.idField;
			created.push({
				binding: resource.binding,
				friendlyName: HANDLERS[resource.resourceType].friendlyName,
				idField,
				id: (resource.handler.binding as Record<string, unknown>)[idField],
			});
		}
	} catch (e) {
		if (created.length > 0) {
			logger.warn(
				`Provisioning failed partway through. The following resources were created on your Cloudflare account and may be orphaned:\n` +
					created
						.map(
							(r) =>
								`  - ${r.binding} (${r.friendlyName}): ${r.idField}="${String(r.id)}"`
						)
						.join("\n") +
					`\n\nYou can reuse them by adding these values to your wrangler config, or delete them manually.`
			);
		}
		throw e;
	}

	const resourceCount = pendingResources.reduce(
		(acc, resource) => {
			acc[resource.resourceType] ??= 0;
			acc[resource.resourceType]++;
			return acc;
		},
		{} as Record<string, number>
	);
	logger.log(`🎉 All resources provisioned, continuing with deployment...\n`);

	metrics.sendMetricsEvent("provision resources", resourceCount, {
		sendMetrics: config.send_metrics,
	});
}

type ProvisioningFailure = {
	binding: string;
	type: string;
	friendlyName: string;
	hint: string;
};

/**
 * Provision a single resource. In non-interactive mode, the pre-flight
 * in provisionBindings guarantees this is only called for resources
 * that can succeed (ciSafe or name provided).
 */
async function runProvisioningFlow(
	item: PendingResource,
	preExisting: NormalisedResourceInfo[],
	friendlyBindingName: string,
	scriptName: string
): Promise<void> {
	const NEW_OPTION_VALUE = "__WRANGLER_INTERNAL_NEW";
	const defaultName = generateDefaultName(scriptName, item.binding);
	logger.log("Provisioning", item.binding, `(${friendlyBindingName})...`);

	// Path 1: Name found in config -- create non-interactively
	if (item.handler.name) {
		logger.log("Resource name found in config:", item.handler.name);
		logger.log(
			`🌀 Creating new ${friendlyBindingName} "${item.handler.name}"...`
		);
		await item.handler.provision(item.handler.name);
	} else if (!isNonInteractiveOrCI()) {
		// Path 2: Interactive terminal -- searchable list of existing + create new.
		// Skip the search prompt entirely if there are no existing resources to
		// choose from, since "Create new" would be the only option.
		let action: string | undefined = NEW_OPTION_VALUE;
		if (preExisting.length > 0) {
			const choices = [
				{ title: "Create new", value: NEW_OPTION_VALUE },
				...preExisting,
			];

			action = await search(
				`Select an existing ${friendlyBindingName} or create a new one`,
				{ choices }
			);
		}

		if (!action || action === NEW_OPTION_VALUE) {
			const name = await prompt(
				`Enter a name for your new ${friendlyBindingName}`,
				{
					defaultValue: defaultName,
				}
			);
			logger.log(`🌀 Creating new ${friendlyBindingName} "${name}"...`);
			await item.handler.interactiveCreate(name);
		} else {
			item.handler.connect(action);
		}
	} else if (item.handler.ciSafe) {
		// Path 3: CI + safe binding -- auto-create with generated name
		logger.log(`🌀 Creating new ${friendlyBindingName} "${defaultName}"...`);
		await item.handler.provision(defaultName);
	} else {
		// Safety net — pre-flight should have caught this
		throw new UserError(
			`Cannot auto-provision ${friendlyBindingName} "${item.binding}" in non-interactive mode.`
		);
	}

	logger.log(`✨ ${item.binding} provisioned`);
	logger.log();
}

/**
 * Report all provisioning failures at once.
 *
 * Nothing is created before this is called — the check is a pre-flight
 * so we never orphan resources.
 */
function reportProvisioningFailures(
	failures: ProvisioningFailure[],
	wouldSucceed: { binding: string; friendlyName: string }[] = []
): never {
	const lines = failures.map(
		(f) => `  - ${f.binding} (${f.friendlyName}): ${f.hint}`
	);

	let msg = `Could not auto-provision the following bindings:\n${lines.join("\n")}`;
	msg += `\n\nAlternatively, run \`wrangler deploy\` in an interactive terminal to provision these resources via a guided wizard.`;
	if (wouldSucceed.length > 0) {
		const names = wouldSucceed
			.map((r) => `${r.binding} (${r.friendlyName})`)
			.join(", ");
		msg += `\n\nOnce resolved, these bindings will be auto-provisioned on deploy: ${names}`;
	}

	throw new UserError(msg);
}
