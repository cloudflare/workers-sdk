import { readFileSync } from "node:fs";
import path from "node:path";
import { Response } from "undici";
import { getBindings } from "../../deployment-bundle/bindings";
import { createWorkerUploadForm } from "../../deployment-bundle/create-worker-upload-form";
import { loadSourceMaps } from "../../deployment-bundle/source-maps";
import type { BundleResult } from "../../deployment-bundle/bundle";
import type { CfPlacement, Config } from "@cloudflare/workers-utils";
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

	let placement: CfPlacement | undefined;
	if (config?.placement) {
		const plcmt = config.placement;
		const hint = "hint" in plcmt ? plcmt.hint : undefined;

		if (!hint && plcmt.mode === "off") {
			placement = undefined;
		} else if (hint || plcmt.mode === "smart") {
			placement = { mode: "smart", hint: hint };
		} else {
			// mode is undefined or "targeted", which both map to the targeted variant
			// TypeScript needs explicit checks to narrow the union type
			if ("region" in plcmt && plcmt.region) {
				placement = { mode: "targeted", region: plcmt.region };
			} else if ("host" in plcmt && plcmt.host) {
				placement = { mode: "targeted", host: plcmt.host };
			} else if ("hostname" in plcmt && plcmt.hostname) {
				placement = { mode: "targeted", hostname: plcmt.hostname };
			} else {
				placement = undefined;
			}
		}
	} else {
		placement = undefined;
	}

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
