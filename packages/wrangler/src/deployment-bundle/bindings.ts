import { inputPrompt } from "@cloudflare/cli/interactive";
import chalk from "chalk";
import { fetchResult } from "../cfetch";
import { printBindings } from "../config";
import { createD1Database } from "../d1/create";
import { listDatabases } from "../d1/list";
import { prompt } from "../dialogs";
import { FatalError } from "../errors";
import { createKVNamespace, listKVNamespaces } from "../kv/helpers";
import { logger } from "../logger";
import { createR2Bucket, listR2Buckets } from "../r2/helpers";
import type { Config } from "../config";
import type { Database } from "../d1/types";
import type { KVNamespaceInfo } from "../kv/helpers";
import type { R2BucketInfo } from "../r2/helpers";
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
	r2_buckets?: (CfR2Bucket & PendingResourceOperations)[];
	d1_databases?: (CfD1Database & PendingResourceOperations)[];
};
export async function provisionBindings(
	bindings: CfWorkerInit["bindings"],
	accountId: string,
	scriptName: string
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
						await createR2Bucket(
							accountId,
							bucketName
							// location,
							// jurisdiction,
							// storageClass
						);
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
						// tODO check d1 isn't doing something funny here
						d1.database_id = id;
					},
				});
			}
		}
	}

	const MAX_OPTIONS = 4;

	if (Object.values(pendingResources).some((v) => v && v.length > 0)) {
		logger.log();
		printBindings(pendingResources, { provisioning: true });
		printDivider();
		if (pendingResources.kv_namespaces?.length) {
			const prettyBindingName = "KV Namespace";
			const preExisting = await listKVNamespaces(accountId);
			const options = preExisting
				.map((resource) => {
					return {
						label: resource.title,
						value: resource.id,
					};
				})
				.slice(0, MAX_OPTIONS - 1);
			if (options.length < preExisting.length) {
				options.push({
					label: "Other (too many to list)",
					value: "manual",
				});
			}

			for (const kv of pendingResources.kv_namespaces) {
				logger.log("Provisioning", kv.binding, `(${prettyBindingName})...`);
				let name: string;
				const selected =
					options.length === 0
						? "new"
						: await inputPrompt({
								type: "select",
								question: `Would you like to connect an existing ${prettyBindingName} or create a new one?`,
								options: options.concat([
									{ label: "Create new", value: "new" },
								]),
								label: kv.binding,
								defaultValue: "new",
							});
				if (selected === "new") {
					name = await prompt(`Enter a name for the new ${prettyBindingName}`);
					logger.log(`🌀 Creating new ${prettyBindingName} "${name}"...`);
					// creates KV and mutates "bindings" to update id
					await kv.create(name);
				} else if (selected === "manual") {
					let searchedResource: KVNamespaceInfo | undefined;
					while (searchedResource === undefined) {
						const input = await prompt(
							`Enter the title or id of an existing ${prettyBindingName}`
						);
						searchedResource = preExisting.find(
							(r) => r.title === input || r.id === input
						);
						if (!searchedResource) {
							logger.log(
								`No ${prettyBindingName} with the title/id "${input}" found. Please try again.`
							);
						}
					}
					name = searchedResource?.title;
					//  mutates "bindings" to update id
					kv.updateId(searchedResource.id);
				} else {
					const selectedResource = preExisting.find((r) => r.id === selected);
					if (!selectedResource) {
						throw new FatalError(
							`${prettyBindingName} with id ${selected} not found`
						);
					}
					name = selectedResource.title;
					kv.updateId(selected);
				}
				logger.log(`✨ ${kv.binding} provisioned with ${name}`);
				printDivider();
			}
		}

		if (pendingResources.d1_databases?.length) {
			const prettyBindingName = "D1 Database";
			const preExisting = await listDatabases(accountId);
			const options = preExisting
				.map((resource) => {
					return {
						label: resource.name,
						value: resource.uuid,
					};
				})
				.slice(0, MAX_OPTIONS - 1);
			if (options.length < preExisting.length) {
				options.push({
					label: "Other (too many to list)",
					value: "manual",
				});
			}

			for (const d1 of pendingResources.d1_databases) {
				logger.log("Provisioning", d1.binding, `(${prettyBindingName})...`);
				let name: string;
				const selected =
					options.length === 0
						? "new"
						: await inputPrompt({
								type: "select",
								question: `Would you like to connect an existing ${prettyBindingName} or create a new one?`,
								options: options.concat([
									{ label: "Create new", value: "new" },
								]),
								label: d1.binding,
								defaultValue: "new",
							});
				if (selected === "new") {
					name = await prompt(`Enter a name for the new ${prettyBindingName}`);
					logger.log(`🌀 Creating new ${prettyBindingName} "${name}"...`);
					// creates KV and mutates "bindings" to update id
					await d1.create(name);
				} else if (selected === "manual") {
					let searchedResource: Database | undefined;
					while (searchedResource === undefined) {
						const input = await prompt(
							`Enter the name or id of an existing ${prettyBindingName}`
						);
						searchedResource = preExisting.find(
							(r) => r.name === input || r.uuid === input
						);
						if (!searchedResource) {
							logger.log(
								`No ${prettyBindingName} with the name/id "${input}" found. Please try again.`
							);
						}
					}
					name = searchedResource?.name;
					//  mutates "bindings" to update id
					d1.updateId(searchedResource.uuid);
				} else {
					const selectedResource = preExisting.find((r) => r.uuid === selected);
					if (!selectedResource) {
						throw new FatalError(
							`${prettyBindingName} with id ${selected} not found`
						);
					}
					name = selectedResource.name;
					d1.updateId(selected);
				}
				logger.log(`✨ ${d1.binding} provisioned with ${name}`);
				printDivider();
			}
		}
		if (pendingResources.r2_buckets?.length) {
			const prettyBindingName = "R2 Bucket";
			const preExisting = await listR2Buckets(accountId);
			const options = preExisting
				.map((resource) => {
					return {
						label: resource.name,
						value: resource.name,
					};
				})
				.slice(0, MAX_OPTIONS - 1);
			if (options.length < preExisting.length) {
				options.push({
					label: "Other (too many to list)",
					value: "manual",
				});
			}

			for (const r2 of pendingResources.r2_buckets) {
				logger.log("Provisioning", r2.binding, `(${prettyBindingName})...`);
				let name: string;
				const selected =
					options.length === 0
						? "new"
						: await inputPrompt({
								type: "select",
								question: `Would you like to connect an existing ${prettyBindingName} or create a new one?`,
								options: options.concat([
									{ label: "Create new", value: "new" },
								]),
								label: r2.binding,
								defaultValue: "new",
							});
				if (selected === "new") {
					name = await prompt(`Enter a name for the new ${prettyBindingName}`);
					logger.log(`🌀 Creating new ${prettyBindingName} "${name}"...`);
					// creates R2 bucket and mutates "bindings" to update id
					await r2.create(name);
				} else if (selected === "manual") {
					let searchedResource: R2BucketInfo | undefined;
					while (searchedResource === undefined) {
						const input = await prompt(
							`Enter the name of an existing ${prettyBindingName}`
						);
						searchedResource = preExisting.find((r) => r.name === input);
						if (!searchedResource) {
							logger.log(
								`No ${prettyBindingName} with the name "${input}" found. Please try again.`
							);
						}
					}
					name = searchedResource.name;
					//  mutates "bindings" to update id
					r2.updateId(searchedResource.name);
				} else {
					name = selected;
					r2.updateId(selected);
				}
				logger.log(`✨ ${r2.binding} provisioned with ${name}`);
				printDivider();
			}
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
