import chalk from "chalk";
import { isLegacyEnv } from "..";
import { fetchResult } from "../cfetch";
import { createD1Database } from "../d1/create";
import { listDatabases } from "../d1/list";
import { prompt, select } from "../dialogs";
import { FatalError, UserError } from "../errors";
import { createKVNamespace, listKVNamespaces } from "../kv/helpers";
import { logger } from "../logger";
import { createR2Bucket, listR2Buckets } from "../r2/helpers";
import { printBindings } from "../utils/print-bindings";
import type { Config } from "../../../wrangler-shared/src/config";
import type { WorkerMetadataBinding } from "./create-worker-upload-form";
import type {
	CfD1Database,
	CfKvNamespace,
	CfR2Bucket,
	CfWorkerInit,
} from "./worker";

/**
 * A symbol to inherit a binding from the deployed worker.
 */
export const INHERIT_SYMBOL = Symbol.for("inherit_binding");

export function getBindings(
	config: Config | undefined,
	options?: {
		pages?: boolean;
	}
): CfWorkerInit["bindings"] {
	return {
		kv_namespaces: config?.kv_namespaces,
		send_email: options?.pages ? undefined : config?.send_email,
		vars: config?.vars,
		wasm_modules: options?.pages ? undefined : config?.wasm_modules,
		browser: config?.browser,
		ai: config?.ai,
		version_metadata: config?.version_metadata,
		text_blobs: options?.pages ? undefined : config?.text_blobs,
		data_blobs: options?.pages ? undefined : config?.data_blobs,
		durable_objects: config?.durable_objects,
		workflows: config?.workflows,
		queues: config?.queues.producers?.map((producer) => {
			return { binding: producer.binding, queue_name: producer.queue };
		}),
		r2_buckets: config?.r2_buckets,
		d1_databases: config?.d1_databases,
		vectorize: config?.vectorize,
		hyperdrive: config?.hyperdrive,
		services: config?.services,
		analytics_engine_datasets: config?.analytics_engine_datasets,
		dispatch_namespaces: options?.pages
			? undefined
			: config?.dispatch_namespaces,
		mtls_certificates: config?.mtls_certificates,
		pipelines: options?.pages ? undefined : config?.pipelines,
		logfwdr: options?.pages ? undefined : config?.logfwdr,
		assets: options?.pages
			? undefined
			: config?.assets?.binding
				? { binding: config?.assets?.binding }
				: undefined,
		unsafe: options?.pages
			? undefined
			: {
					bindings: config?.unsafe.bindings,
					metadata: config?.unsafe.metadata,
					capnp: config?.unsafe.capnp,
				},
	};
}

export type Settings = {
	bindings: Array<WorkerMetadataBinding>;
};

type PendingResourceOperations = {
	create: (name: string) => Promise<string>;
	updateId: (id: string) => void;
};
type PendingResources = {
	kv_namespaces: (CfKvNamespace & PendingResourceOperations)[];
	r2_buckets: (CfR2Bucket & PendingResourceOperations)[];
	d1_databases: (CfD1Database & PendingResourceOperations)[];
};
export async function provisionBindings(
	bindings: CfWorkerInit["bindings"],
	accountId: string,
	scriptName: string,
	autoCreate: boolean,
	config: Config
): Promise<void> {
	const pendingResources: PendingResources = {
		d1_databases: [],
		r2_buckets: [],
		kv_namespaces: [],
	};
	let settings: Settings | undefined;

	try {
		settings = await getSettings(accountId, scriptName);
	} catch (error) {
		logger.debug("No settings found");
	}

	for (const kv of bindings.kv_namespaces ?? []) {
		if (!kv.id) {
			if (inBindingSettings(settings, "kv_namespace", kv.binding)) {
				kv.id = INHERIT_SYMBOL;
			} else {
				pendingResources.kv_namespaces?.push({
					binding: kv.binding,
					async create(title) {
						const id = await createKVNamespace(accountId, title);
						kv.id = id;
						return id;
					},
					updateId(id) {
						kv.id = id;
					},
				});
			}
		}
	}

	for (const r2 of bindings.r2_buckets ?? []) {
		if (!r2.bucket_name) {
			if (inBindingSettings(settings, "r2_bucket", r2.binding)) {
				r2.bucket_name = INHERIT_SYMBOL;
			} else {
				pendingResources.r2_buckets?.push({
					binding: r2.binding,
					async create(bucketName) {
						await createR2Bucket(accountId, bucketName);
						r2.bucket_name = bucketName;
						return bucketName;
					},
					updateId(bucketName) {
						r2.bucket_name = bucketName;
					},
				});
			}
		}
	}

	for (const d1 of bindings.d1_databases ?? []) {
		if (!d1.database_id) {
			if (inBindingSettings(settings, "d1", d1.binding)) {
				d1.database_id = INHERIT_SYMBOL;
			} else {
				pendingResources.d1_databases?.push({
					binding: d1.binding,
					async create(name) {
						const db = await createD1Database(accountId, name);
						d1.database_id = db.uuid;
						return db.uuid;
					},
					updateId(id) {
						d1.database_id = id;
					},
				});
			}
		}
	}

	if (Object.values(pendingResources).some((v) => v && v.length > 0)) {
		if (!isLegacyEnv(config)) {
			throw new UserError(
				"Provisioning resources is not supported with a service environment"
			);
		}
		logger.log();
		printBindings(pendingResources, { provisioning: true });
		logger.log();

		if (pendingResources.kv_namespaces?.length) {
			const preExistingKV = await listKVNamespaces(accountId, true);
			await runProvisioningFlow(
				pendingResources.kv_namespaces,
				preExistingKV.map((ns) => ({ title: ns.title, value: ns.id })),
				"KV Namespace",
				"title or id",
				scriptName,
				autoCreate
			);
		}

		if (pendingResources.d1_databases?.length) {
			const preExisting = await listDatabases(accountId, true);
			await runProvisioningFlow(
				pendingResources.d1_databases,
				preExisting.map((db) => ({ title: db.name, value: db.uuid })),
				"D1 Database",
				"name or id",
				scriptName,
				autoCreate
			);
		}
		if (pendingResources.r2_buckets?.length) {
			const preExisting = await listR2Buckets(accountId);
			await runProvisioningFlow(
				pendingResources.r2_buckets,
				preExisting.map((bucket) => ({
					title: bucket.name,
					value: bucket.name,
				})),
				"R2 Bucket",
				"name",
				scriptName,
				autoCreate
			);
		}
		logger.log(`🎉 All resources provisioned, continuing with deployment...\n`);
	}
}

/** checks whether the binding id can be inherited from a prev deployment */
function inBindingSettings<Type extends WorkerMetadataBinding["type"]>(
	settings: Settings | undefined,
	type: Type,
	bindingName: string
): Extract<WorkerMetadataBinding, { type: Type }> | undefined {
	return settings?.bindings.find(
		(binding): binding is Extract<WorkerMetadataBinding, { type: Type }> =>
			binding.type === type && binding.name === bindingName
	);
}

function getSettings(accountId: string, scriptName: string) {
	return fetchResult<Settings>(
		`/accounts/${accountId}/workers/scripts/${scriptName}/settings`
	);
}

function printDivider() {
	logger.log();
	logger.log(chalk.dim("--------------------------------------"));
	logger.log();
}

type NormalisedResourceInfo = {
	/** The name of the resource */
	title: string;
	/** The id of the resource */
	value: string;
};

async function runProvisioningFlow(
	pending: PendingResources[keyof PendingResources],
	preExisting: NormalisedResourceInfo[],
	friendlyBindingName: string,
	resourceKeyDescriptor: string,
	scriptName: string,
	autoCreate: boolean
) {
	const NEW_OPTION_VALUE = "__WRANGLER_INTERNAL_NEW";
	const SEARCH_OPTION_VALUE = "__WRANGLER_INTERNAL_SEARCH";
	const MAX_OPTIONS = 4;
	if (pending.length) {
		const options = preExisting.slice(0, MAX_OPTIONS - 1);
		if (options.length < preExisting.length) {
			options.push({
				title: "Other (too many to list)",
				value: SEARCH_OPTION_VALUE,
			});
		}

		for (const item of pending) {
			logger.log("Provisioning", item.binding, `(${friendlyBindingName})...`);
			let name: string = "";
			let selected: string;

			if (options.length === 0 || autoCreate) {
				selected = NEW_OPTION_VALUE;
			} else {
				selected = await select(
					`Would you like to connect an existing ${friendlyBindingName} or create a new one?`,
					{
						choices: options.concat([{ title: "Create new", value: "new" }]),
						defaultOption: options.length,
					}
				);
			}

			if (selected === NEW_OPTION_VALUE) {
				const defaultValue = `${scriptName}-${item.binding.toLowerCase().replace("_", "-")}`;
				name = autoCreate
					? defaultValue
					: await prompt(`Enter a name for your new ${friendlyBindingName}`, {
							defaultValue,
						});
				logger.log(`🌀 Creating new ${friendlyBindingName} "${name}"...`);
				// creates new resource and mutates `bindings` to update id
				await item.create(name);
			} else if (selected === SEARCH_OPTION_VALUE) {
				let searchedResource: NormalisedResourceInfo | undefined;
				while (searchedResource === undefined) {
					const input = await prompt(
						`Enter the ${resourceKeyDescriptor} for an existing ${friendlyBindingName}`
					);
					searchedResource = preExisting.find((r) => {
						if (r.title === input || r.value === input) {
							name = r.title;
							item.updateId(r.value);
							return true;
						} else {
							return false;
						}
					});
					if (!searchedResource) {
						logger.log(
							`No ${friendlyBindingName} with that ${resourceKeyDescriptor} "${input}" found. Please try again.`
						);
					}
				}
			} else {
				const selectedResource = preExisting.find((r) => {
					if (r.value === selected) {
						name = r.title;
						item.updateId(selected);
						return true;
					} else {
						return false;
					}
				});
				// we shouldn't get here
				if (!selectedResource) {
					throw new FatalError(
						`${friendlyBindingName} with id ${selected} not found`
					);
				}
			}

			logger.log(`✨ ${item.binding} provisioned with ${name}`);
			printDivider();
		}
	}
}
