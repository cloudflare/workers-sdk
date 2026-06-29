import assert from "node:assert";
import { URLSearchParams } from "node:url";
import { APIError, configFileName, UserError } from "@cloudflare/workers-utils";
import {
	fetchPagedListResult,
	fetchResult,
	logger,
} from "../../shared/context";
import { isWorkerNotFoundError } from "./worker-not-found-error";
import type {
	CfWorkerInit,
	Config,
	DurableObjectNamespace,
} from "@cloudflare/workers-utils";

type DurableObjectNamespaceRequest = {
	className: string;
	defaultRegion: "dog" | "vet";
	namespaceName: string;
};

export class DurableObjectNamespaceMissingScriptOrClassError extends Error {
	constructor(cause: unknown) {
		super("Worker or Durable Object class is missing for namespace creation.", {
			cause,
		});
	}
}

export async function ensureDurableObjectNamespaces(
	scriptName: string,
	props: {
		accountId: string | undefined;
		config: Config;
		dispatchNamespace: string | undefined;
	}
) {
	const requests = getDurableObjectNamespaceRequests(props.config, scriptName);
	if (requests.length === 0) {
		return;
	}

	assert(props.accountId, "Missing accountId");
	if (props.dispatchNamespace) {
		throw new UserError(
			"Durable Object namespaces cannot be created in internal regions " +
				"for dispatch namespace deploys.",
			{
				telemetryMessage:
					"durable object namespace internal region dispatch namespace",
			}
		);
	}

	validateNoMigrationConflicts(props.config, requests);

	const existingNamespaces = await listDurableObjectNamespaces(
		props.config,
		props.accountId
	);
	for (const request of requests) {
		const existingNamespace = existingNamespaces.find(
			(namespace) =>
				namespace.script === scriptName && namespace.class === request.className
		);
		if (existingNamespace) {
			const existingRegion =
				existingNamespace.default_region ?? existingNamespace.defaultRegion;
			if (existingRegion && existingRegion !== request.defaultRegion) {
				throw new UserError(
					`Durable Object namespace "${existingNamespace.name}" for class ` +
						`"${request.className}" already exists in region ` +
						`"${existingRegion}", but the config requests ` +
						`"${request.defaultRegion}".`,
					{
						telemetryMessage:
							"durable object namespace internal region mismatch",
					}
				);
			}
			continue;
		}

		let namespace: DurableObjectNamespace;
		try {
			namespace = await createDurableObjectNamespace(
				props.config,
				props.accountId,
				{
					name: request.namespaceName,
					script: scriptName,
					class: request.className,
					default_region: request.defaultRegion,
					use_sqlite: true,
				}
			);
		} catch (err) {
			if (isMissingScriptOrClassError(err)) {
				throw new DurableObjectNamespaceMissingScriptOrClassError(err);
			}
			throw err;
		}
		const namespaceId = namespace.id ?? namespace.namespace_id;
		const idText = namespaceId ? ` with ID "${namespaceId}"` : "";
		logger.log(
			`Created Durable Object namespace "${namespace.name}"${idText} ` +
				`in region "${request.defaultRegion}"`
		);
	}
}

function getDurableObjectNamespaceRequests(
	config: Config,
	scriptName: string
): DurableObjectNamespaceRequest[] {
	const requests = new Map<string, DurableObjectNamespaceRequest>();

	for (const binding of config.durable_objects.bindings) {
		const namespaceConfig = binding.namespace;
		if (namespaceConfig === undefined) {
			continue;
		}
		const request = {
			className: binding.class_name,
			defaultRegion: namespaceConfig.default_region,
			namespaceName:
				namespaceConfig.name ?? `${scriptName}_${binding.class_name}`,
		};
		const existingRequest = requests.get(request.className);
		if (
			existingRequest &&
			(existingRequest.defaultRegion !== request.defaultRegion ||
				existingRequest.namespaceName !== request.namespaceName)
		) {
			throw new UserError(
				`Class "${request.className}" has multiple Durable Object ` +
					"namespace configurations.",
				{
					telemetryMessage: "durable object namespace duplicate config",
				}
			);
		}
		requests.set(request.className, request);
	}

	return Array.from(requests.values());
}

function validateNoMigrationConflicts(
	config: Config,
	requests: DurableObjectNamespaceRequest[]
) {
	const classes = new Set(requests.map((request) => request.className));
	for (const migration of config.migrations) {
		for (const className of [
			...(migration.new_classes ?? []),
			...(migration.new_sqlite_classes ?? []),
			...(migration.renamed_classes ?? []).flatMap((rename) => [
				rename.from,
				rename.to,
			]),
			...(migration.deleted_classes ?? []),
		]) {
			if (classes.has(className)) {
				throw new UserError(
					`Class "${className}" uses ` +
						"durable_objects.bindings.namespace.default_region, but it is " +
						"also listed in a Durable Object migration. Remove the " +
						"migration for this class so " +
						"Wrangler can create the namespace in the requested region.",
					{
						telemetryMessage:
							"durable object namespace internal region migration conflict",
					}
				);
			}
		}
	}
}

async function listDurableObjectNamespaces(
	config: Config,
	accountId: string
): Promise<DurableObjectNamespace[]> {
	return await fetchPagedListResult<DurableObjectNamespace>(
		config,
		`/accounts/${accountId}/workers/durable_objects/namespaces`,
		{},
		new URLSearchParams({ per_page: "1000" })
	);
}

async function createDurableObjectNamespace(
	config: Config,
	accountId: string,
	body: {
		name: string;
		script: string;
		class: string;
		default_region: "dog" | "vet";
		use_sqlite: true;
	}
): Promise<DurableObjectNamespace> {
	return await fetchResult<DurableObjectNamespace>(
		config,
		`/accounts/${accountId}/workers/durable_objects/namespaces`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}
	);
}

function isMissingScriptOrClassError(err: unknown): boolean {
	return err instanceof APIError && (err.code === 10007 || err.code === 10070);
}

/**
 * For a given Worker + migrations config, figure out which migrations
 * to upload based on the current migration tag of the deployed Worker.
 */
export async function getMigrationsToUpload(
	scriptName: string,
	props: {
		accountId: string | undefined;
		config: Config;
		useServiceEnvironments: boolean | undefined;
		env: string | undefined;
		dispatchNamespace: string | undefined;
	}
): Promise<CfWorkerInit["migrations"]> {
	const { config, accountId } = props;

	assert(accountId, "Missing accountId");
	let migrations;
	if (config.migrations.length > 0) {
		type ScriptData = { id: string; migration_tag?: string };
		let script: ScriptData | undefined;
		if (props.dispatchNamespace) {
			try {
				const scriptData = await fetchResult<{ script: ScriptData }>(
					config,
					`/accounts/${accountId}/workers/dispatch/namespaces/${props.dispatchNamespace}/scripts/${scriptName}`
				);
				script = scriptData.script;
			} catch (err) {
				suppressNotFoundError(err);
			}
		} else {
			if (props.useServiceEnvironments) {
				try {
					if (props.env) {
						const scriptData = await fetchResult<{
							script: ScriptData;
						}>(
							config,
							`/accounts/${accountId}/workers/services/${scriptName}/environments/${props.env}`
						);
						script = scriptData.script;
					} else {
						const scriptData = await fetchResult<{
							default_environment: {
								script: ScriptData;
							};
						}>(config, `/accounts/${accountId}/workers/services/${scriptName}`);
						script = scriptData.default_environment.script;
					}
				} catch (err) {
					suppressNotFoundError(err);
				}
			} else {
				const scripts = await fetchResult<ScriptData[]>(
					config,
					`/accounts/${accountId}/workers/scripts`
				);
				script = scripts.find(({ id }) => id === scriptName);
			}
		}

		if (script?.migration_tag) {
			const scriptMigrationTag = script.migration_tag;
			const foundIndex = config.migrations.findIndex(
				(migration) => migration.tag === scriptMigrationTag
			);
			if (foundIndex === -1) {
				logger.warn(
					`The published script ${scriptName} has a migration tag "${script.migration_tag}, which was not found in your ${configFileName(config.configPath)} file. You may have already deleted it. Applying all available migrations to the script...`
				);
				migrations = {
					old_tag: script.migration_tag,
					new_tag: config.migrations[config.migrations.length - 1].tag,
					steps: config.migrations.map(({ tag: _tag, ...rest }) => rest),
				};
			} else {
				if (foundIndex !== config.migrations.length - 1) {
					migrations = {
						old_tag: script.migration_tag,
						new_tag: config.migrations[config.migrations.length - 1].tag,
						steps: config.migrations
							.slice(foundIndex + 1)
							.map(({ tag: _tag, ...rest }) => rest),
					};
				}
			}
		} else {
			migrations = {
				new_tag: config.migrations[config.migrations.length - 1].tag,
				steps: config.migrations.map(({ tag: _tag, ...rest }) => rest),
			};
		}
	}
	return migrations;
}

const suppressNotFoundError = (err: unknown) => {
	if (!isWorkerNotFoundError(err) && (err as { code: number }).code !== 10092) {
		throw err;
	}
};
