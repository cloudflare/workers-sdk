import { readFileSync } from "node:fs";
import path from "node:path";
import { getBindings } from "@cloudflare/workers-utils/config";
import { Response } from "undici";
import { createWorkerUploadForm } from "../../deployment-bundle/create-worker-upload-form";
import { loadSourceMaps } from "../../deployment-bundle/source-maps";
import { parseConfigPlacement } from "../../utils/placement";
import type { BundleResult } from "../../deployment-bundle/bundle";
import type {
	CfPlacement,
	WorkerMetadataBinding,
	WorkerUploadMetadataBinding,
} from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils/config";
import type { Blob } from "node:buffer";
import type { FormData } from "undici";

/**
 * Generates the `_worker.bundle` contents for Pages, which still reads D1 IDs
 * from `id` rather than `database_id`.
 */
export async function createUploadWorkerBundleContents(
	workerBundle: BundleResult,
	config: Config | undefined
): Promise<Blob> {
	const workerBundleFormData = createWorkerBundleFormData(workerBundle, config);
	const metadata: {
		bindings?: (WorkerMetadataBinding | WorkerUploadMetadataBinding)[];
	} = JSON.parse(workerBundleFormData.get("metadata") as string);
	// Remove the empty bindings array if no Pages config has been found
	if (config === undefined) {
		delete metadata.bindings;
	} else if (metadata.bindings) {
		metadata.bindings = metadata.bindings.map((binding) => {
			if (binding.type !== "d1" || !("database_id" in binding)) {
				return binding;
			}
			const { database_id: id, ...pagesBinding } = binding;
			return { ...pagesBinding, id };
		});
	}
	workerBundleFormData.set("metadata", JSON.stringify(metadata));

	return await new Response(workerBundleFormData).blob();
}

/**
 * Creates a `FormData` upload from a `BundleResult`
 */
function createWorkerBundleFormData(
	workerBundle: BundleResult,
	config: Config | undefined
): FormData {
	const mainModule = {
		name: path.basename(workerBundle.resolvedEntryPointPath),
		filePath: workerBundle.resolvedEntryPointPath,
		content: readFileSync(workerBundle.resolvedEntryPointPath, {
			encoding: "utf-8",
		}),
		type: workerBundle.bundleType || "esm",
	};

	let placement: CfPlacement | undefined;

	if (config !== undefined) {
		placement = parseConfigPlacement(config.placement);
	} else {
		placement = undefined;
	}

	return createWorkerUploadForm(
		{
			name: mainModule.name,
			main: mainModule,
			modules: workerBundle.modules,
			migrations: undefined,
			exports: undefined,
			compatibility_date: config?.compatibility_date,
			compatibility_flags: config?.compatibility_flags,
			keepVars: undefined,
			keepSecrets: undefined,
			keepBindings: undefined,
			logpush: undefined,
			sourceMaps: config?.upload_source_maps
				? loadSourceMaps(mainModule, workerBundle.modules, workerBundle)
				: undefined,
			placement: placement,
			tail_consumers: undefined,
			limits: config?.limits,
			assets: undefined,
			containers: undefined, // containers are not supported in Pages
			observability: undefined,
			cache: undefined, // cache is not supported in Pages
		},
		getBindings(config, { pages: true })
	);
}
