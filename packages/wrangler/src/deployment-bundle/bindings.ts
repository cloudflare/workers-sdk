import { randomUUID } from "node:crypto";
import { spinner } from "@cloudflare/cli/interactive";
import { fetchResult } from "../cfetch";
import { printBindings } from "../config";
import { createD1Database } from "../d1/create";
import { confirm } from "../dialogs";
import { FatalError } from "../errors";
import { createKVNamespace } from "../kv/helpers";
import { logger } from "../logger";
import { createR2Bucket } from "../r2/helpers";
import type { Config } from "../config";
import type { WorkerMetadataBinding } from "./create-worker-upload-form";
import type { CfWorkerInit } from "./worker";

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

export type PendingResource =
	| {
			name: string;
			type: "kv";
			create: (title: string) => Promise<string>;
	  }
	| {
			name: string;
			type: "r2";
			create: (
				bucketName: string,
				location?: string,
				jurisdiction?: string,
				storageClass?: string
			) => Promise<string>;
	  }
	| {
			name: string;
			type: "d1";
			create: (name: string, location?: string) => Promise<string>;
	  };

export async function provisionBindings(
	bindings: CfWorkerInit["bindings"],
	accountId: string,
	scriptName: string
): Promise<void> {
	const pendingResources: Array<PendingResource> = [];
	let settings: Settings | undefined;

	try {
		settings = await getSettings(accountId, scriptName);
	} catch (error) {
		logger.debug("No settings found");
	}

	for (const kv of bindings.kv_namespaces ?? []) {
		if (!kv.id) {
			if (hasBindingSettings(settings, "kv_namespace", kv.binding)) {
				kv.id = INHERIT_SYMBOL;
			} else {
				pendingResources.push({
					type: "kv",
					name: kv.binding,
					async create(title) {
						const id = await createKVNamespace(accountId, title);
						kv.id = id;
						return id;
					},
				});
			}
		}
	}

	for (const r2 of bindings.r2_buckets ?? []) {
		if (!r2.bucket_name) {
			if (hasBindingSettings(settings, "r2_bucket", r2.binding)) {
				r2.bucket_name = INHERIT_SYMBOL;
			} else {
				pendingResources.push({
					type: "r2",
					name: r2.binding,
					async create(bucketName, location, jurisdiction, storageClass) {
						await createR2Bucket(
							accountId,
							bucketName,
							location,
							jurisdiction,
							storageClass
						);
						r2.bucket_name = bucketName;
						return bucketName;
					},
				});
			}
		}
	}

	for (const d1 of bindings.d1_databases ?? []) {
		if (!d1.database_id) {
			if (hasBindingSettings(settings, "d1", d1.binding)) {
				d1.database_id = INHERIT_SYMBOL;
			} else {
				pendingResources.push({
					type: "d1",
					name: d1.binding,
					async create(name, location) {
						const db = await createD1Database(accountId, name, location);
						d1.database_id = db.uuid;
						return db.uuid;
					},
				});
			}
		}
	}

	if (pendingResources.length > 0) {
		printBindings(bindings);

		// Stylistic newline
		logger.log();

		const ok = await confirm(
			"Would you like Wrangler to provision these resources on your behalf and bind them to your project?"
		);

		if (ok) {
			logger.log("Provisioning resources...");

			// After asking the user, create the ones we need to create, mutating `bindings` in the process
			for (const binding of pendingResources) {
				const s = spinner();

				s.start(`- Provisioning ${binding.name}...`);
				const id = await binding.create(`${binding.name}-${randomUUID()}`);
				s.stop(`- ${binding.name} provisioned with ID "${id}"`);
			}
		} else {
			throw new FatalError("Deployment aborted");
		}

		logger.log(`All resources provisioned, continuing deployment...`);
	}
}

function hasBindingSettings<Type extends WorkerMetadataBinding["type"]>(
	settings: Settings | undefined,
	type: Type,
	name: string
): Extract<WorkerMetadataBinding, { type: Type }> | undefined {
	return settings?.bindings.find(
		(binding): binding is Extract<WorkerMetadataBinding, { type: Type }> =>
			binding.type === type && binding.name === name
	);
}

function getSettings(accountId: string, scriptName: string) {
	return fetchResult<Settings>(
		`/accounts/${accountId}/workers/scripts/${scriptName}/settings`
	);
}
