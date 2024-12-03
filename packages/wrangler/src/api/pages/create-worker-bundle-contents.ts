import { readFileSync } from "node:fs";
import path from "node:path";
import { Response } from "undici";
import { getBindings } from "../../deployment-bundle/bindings";
import { createWorkerUploadForm } from "../../deployment-bundle/create-worker-upload-form";
import { loadSourceMaps } from "../../deployment-bundle/source-maps";
import type { Config } from "../../config";
import type { BundleResult } from "../../deployment-bundle/bundle";
import type { CfPlacement } from "../../deployment-bundle/worker";
import type { Blob } from "node:buffer";
import type { FormData } from "undici";

/**
 * Takes a Worker bundle - `BundleResult` - and generates the _worker.bundle
 * contents
 */
export async function createUploadWorkerBundleContents(
	workerBundle: BundleResult,
	config: Config | undefined
): Promise<Blob> {
	const workerBundleFormData = createWorkerBundleFormData(workerBundle, config);
	const metadata = JSON.parse(workerBundleFormData.get("metadata") as string);
	// Remove the empty bindings array if no Pages config has been found
	if (config === undefined) {
		delete metadata.bindings;
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

	// The upload API only accepts an empty string or no specified placement for the "off" mode.
	const placement: CfPlacement | undefined =
		config?.placement?.mode === "smart"
			? { mode: "smart", hint: config.placement.hint }
			: undefined;

	return createWorkerUploadForm({
		name: mainModule.name,
		main: mainModule,
		modules: workerBundle.modules,
		bindings: getBindings(config, { pages: true }),
		migrations: undefined,
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
		observability: undefined,
	});
}
