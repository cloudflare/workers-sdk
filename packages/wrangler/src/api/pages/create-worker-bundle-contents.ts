import { readFileSync } from "node:fs";
import path from "node:path";
import { Response } from "undici";
import { createWorkerUploadForm } from "../../create-worker-upload-form";
import type { BundleResult } from "../../bundle";
import type { CfWorkerInit } from "../../worker";
import type { Blob } from "node:buffer";
import type { FormData } from "undici";

/**
 * Takes a Worker bundle - `BundleResult` - and generates the _worker.bundle
 * contents
 */
export async function createUploadWorkerBundleContents(
	workerBundle: BundleResult
): Promise<Blob> {
	const workerBundleFormData = createWorkerBundleFormData(workerBundle);
	const metadata = JSON.parse(workerBundleFormData.get("metadata") as string);

	/**
	 * Pages doesn't need the metadata bindings returned by
	 * `createWorkerBundleFormData`. Let's strip them out and return only
	 * the contents we need
	 */
	workerBundleFormData.set(
		"metadata",
		JSON.stringify({ main_module: metadata.main_module })
	);

	return await new Response(workerBundleFormData).blob();
}

/**
 * Creates a `FormData` upload from a `BundleResult`
 */
function createWorkerBundleFormData(workerBundle: BundleResult): FormData {
	const mainModule = {
		name: path.basename(workerBundle.resolvedEntryPointPath),
		content: readFileSync(workerBundle.resolvedEntryPointPath, {
			encoding: "utf-8",
		}),
		type: workerBundle.bundleType || "esm",
	};

	const worker: CfWorkerInit = {
		name: mainModule.name,
		main: mainModule,
		modules: workerBundle.modules,
		bindings: {
			vars: undefined,
			kv_namespaces: undefined,
			send_email: undefined,
			wasm_modules: undefined,
			text_blobs: undefined,
			data_blobs: undefined,
			durable_objects: undefined,
			queues: undefined,
			r2_buckets: undefined,
			d1_databases: undefined,
			services: undefined,
			analytics_engine_datasets: undefined,
			dispatch_namespaces: undefined,
			mtls_certificates: undefined,
			logfwdr: undefined,
			unsafe: undefined,
		},
		migrations: undefined,
		compatibility_date: undefined,
		compatibility_flags: undefined,
		usage_model: undefined,
		keepVars: undefined,
		logpush: undefined,
		placement: undefined,
	};

	return createWorkerUploadForm(worker);
}
