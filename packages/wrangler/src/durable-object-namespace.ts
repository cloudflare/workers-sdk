import { CommandLineArgsError } from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "./core/create-command";
import { requireAuth } from "./user";
import type { DurableObjectNamespace } from "@cloudflare/workers-utils";

const INTERNAL_DURABLE_OBJECT_REGIONS = ["dog", "vet"] as const;
type InternalDurableObjectRegion =
	(typeof INTERNAL_DURABLE_OBJECT_REGIONS)[number];

export const durableObjectNamespace = createNamespace({
	metadata: {
		description: "Manage Durable Objects",
		owner: "Workers: Deploy and Config",
		status: "stable",
		hidden: true,
	},
});

export const durableObjectNamespaceNamespace = createNamespace({
	metadata: {
		description: "Manage Durable Object namespaces",
		owner: "Workers: Deploy and Config",
		status: "stable",
		hidden: true,
	},
});

export const durableObjectNamespaceCreateCommand = createCommand({
	metadata: {
		description:
			"Create a SQLite-backed Durable Object namespace in an internal region",
		owner: "Workers: Deploy and Config",
		status: "stable",
		hidden: true,
	},
	args: {
		name: {
			describe: "Name of the Durable Object namespace",
			type: "string",
			demandOption: true,
		},
		"script-name": {
			describe: "Name of the Worker that implements the Durable Object",
			type: "string",
			requiresArg: true,
			demandOption: true,
		},
		"class-name": {
			describe: "Exported Durable Object class name",
			type: "string",
			requiresArg: true,
			demandOption: true,
		},
		"default-region": {
			describe: "Internal default region for the namespace (dog or vet)",
			type: "string",
			requiresArg: true,
			demandOption: true,
		},
	},
	positionalArgs: ["name"],
	behaviour: {
		sendMetrics: false,
	},
	validateArgs(args) {
		args.defaultRegion = normalizeInternalDurableObjectRegion(
			args.defaultRegion
		);
	},
	async handler(args, { config, fetchResult, logger }) {
		const accountId = await requireAuth(config);
		const namespace = await fetchResult<DurableObjectNamespace>(
			config,
			`/accounts/${accountId}/workers/durable_objects/namespaces`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: args.name,
					script: args.scriptName,
					class: args.className,
					default_region: args.defaultRegion,
					use_sqlite: true,
				}),
			}
		);
		const namespaceId = namespace.id ?? namespace.namespace_id;
		const namespaceName = namespace.name ?? args.name;

		if (namespaceId) {
			logger.log(
				`Created Durable Object namespace "${namespaceName}" with ID ` +
					`"${namespaceId}" in region "${args.defaultRegion}"`
			);
		} else {
			logger.log(
				`Created Durable Object namespace "${namespaceName}" ` +
					`in region "${args.defaultRegion}"`
			);
		}
	},
});

function normalizeInternalDurableObjectRegion(
	region: string | undefined
): InternalDurableObjectRegion {
	const normalized = region?.toLowerCase();
	if (!isInternalDurableObjectRegion(normalized)) {
		throw new CommandLineArgsError(
			`--default-region must be one of: ${INTERNAL_DURABLE_OBJECT_REGIONS.join(", ")}`
		);
	}
	return normalized;
}

function isInternalDurableObjectRegion(
	region: string | undefined
): region is InternalDurableObjectRegion {
	return INTERNAL_DURABLE_OBJECT_REGIONS.some((value) => value === region);
}
