import {
	DEFAULT_WORKER_DIRECTORY_NAME,
	readBuildOutput,
} from "@cloudflare/build-output-utils";
import { convertToWranglerConfig } from "@cloudflare/config";
import { normalizeAndValidateConfig } from "@cloudflare/workers-utils";
import type {
	ModuleType,
	ParsedInputContainerConfig,
	ParsedOutputContainerConfig,
} from "@cloudflare/config";
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
 * Preview currently uses only the `default` Worker, so this returns a
 * single-element array.
 */
export async function readBuildOutputWorkers(
	root: string
): Promise<BuildOutputPreviewWorker[]> {
	// `settings` comes from the top-level `config.json` holding project-level
	// settings (`account_id`, `compliance_region`) shared by every Worker. It
	// also carries the `mode` the build ran in, which `convertToWranglerConfig`
	// ignores — preview does not act on it yet.
	const { workers, settings, containers } = await readBuildOutput(root);
	const worker = workers[DEFAULT_WORKER_DIRECTORY_NAME];

	const { manifest, ...inputShape } = worker.config;
	const rawConfig = convertToWranglerConfig(
		inputShape,
		settings,
		Object.values(containers).map(({ config }) =>
			convertOutputContainerToInput(config)
		)
	);

	const { config, diagnostics } = normalizeAndValidateConfig(
		rawConfig,
		undefined,
		undefined,
		// Build Output preview does not consume Container images yet. Include
		// their configs for reference validation, but do not prepare them locally.
		{ enableContainers: false },
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

type OutputContainerImage = Extract<
	ParsedOutputContainerConfig,
	{ image: unknown }
>["image"];

function convertOutputContainerToInput(
	config: ParsedOutputContainerConfig
): ParsedInputContainerConfig {
	if (config.schedulingPolicy === "durable-object") {
		// Preview does not run Containers. Keep the application metadata so
		// Worker export references can be validated, but omit named images: a
		// locally built output image cannot be represented by Wrangler's remote,
		// managed-registry-only `images.<name>.image` field.
		const { images: _images, ...container } = config;
		return container;
	}

	return {
		...config,
		image: convertOutputContainerImage(config.image),
	};
}

function convertOutputContainerImage(image: OutputContainerImage) {
	return {
		reference: "reference" in image ? image.reference : image.localReference,
	};
}
