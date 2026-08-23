import { readBuildOutput } from "@cloudflare/build-output-utils";
import { convertToWranglerConfig } from "@cloudflare/config";
import { normalizeAndValidateConfig } from "@cloudflare/workers-utils";
import type { ModuleType } from "@cloudflare/config";
import type { Unstable_Config } from "wrangler";

export interface Bundle {
	rootPath: string;
	mainModule: string;
	modules: Record<string, { type: ModuleType }>;
}

export interface BuildOutputPreviewWorker {
	source: "build-output";
	config: Unstable_Config;
	bundle: Bundle | undefined;
}

/**
 * Read the Build Output Specification at
 * `<root>/.cloudflare/output/v0/workers/default/` and reconstruct a
 * `BuildOutputPreviewWorker`.
 *
 * The spec currently holds a single Worker, so this returns a single-element
 * array.
 */
export async function readBuildOutputWorkers(
	root: string
): Promise<BuildOutputPreviewWorker[]> {
	// `settings` comes from the top-level `config.json` holding project-level
	// settings (`account_id`, `compliance_region`) shared by every Worker. It
	// also carries the `mode` the build ran in, which `convertToWranglerConfig`
	// ignores — preview does not act on it yet.
	const { workers, settings } = await readBuildOutput(root);
	const [worker] = workers;

	const { manifest, ...inputShape } = worker.config;
	const rawConfig = convertToWranglerConfig(inputShape, settings);

	const { config, diagnostics } = normalizeAndValidateConfig(
		rawConfig,
		undefined,
		undefined,
		{},
		true
	);

	if (diagnostics.hasWarnings()) {
		console.warn(diagnostics.renderWarnings());
	}
	if (diagnostics.hasErrors()) {
		throw new Error(diagnostics.renderErrors());
	}

	if (worker.assetsDir) {
		config.assets = {
			...(config.assets ?? {}),
			directory: worker.assetsDir,
		};
	}

	let bundle: Bundle | undefined;
	if (manifest && worker.bundleDir) {
		config.main = manifest.mainModule;
		bundle = {
			rootPath: worker.bundleDir,
			mainModule: manifest.mainModule,
			modules: manifest.modules,
		};
	}

	return [{ source: "build-output", config, bundle }];
}
