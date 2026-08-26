import {
	DEFAULT_WORKER_DIRECTORY_NAME,
	readBuildOutput,
} from "@cloudflare/build-output-utils";
import { PRERENDER_WORKER_DIRECTORY_NAME } from "./build-output";
import type { BuildOutputWorker } from "@cloudflare/build-output-utils";
import type {
	ModuleType,
	ParsedOutputSettingsConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";

export interface Bundle {
	rootPath: string;
	mainModule: string;
	modules: Record<string, { type: ModuleType }>;
}

export interface BuildOutputPreviewWorker {
	source: "build-output";
	config: ParsedOutputWorkerConfig;
	settings: ParsedOutputSettingsConfig | undefined;
	assetsDir: string | undefined;
	bundle: Bundle | undefined;
}

/**
 * Read the Build Output Specification and select the Worker used for preview.
 * During prerendering, the `prerender` directory is preferred when present;
 * ordinary preview uses the `default` directory.
 */
export async function readBuildOutputWorkers(
	root: string,
	isPrerender: boolean
): Promise<BuildOutputPreviewWorker[]> {
	// `settings` comes from the top-level `config.json` holding project-level
	// settings (`account_id`, `compliance_region`) shared by every Worker. It
	// also carries the `mode` the build ran in.
	const { workers, settings } = await readBuildOutput(root);
	const defaultWorker = workers[DEFAULT_WORKER_DIRECTORY_NAME];
	const worker = isPrerender
		? (workers[PRERENDER_WORKER_DIRECTORY_NAME] ?? defaultWorker)
		: defaultWorker;

	return [toPreviewWorker(worker, settings)];
}

function toPreviewWorker(
	worker: BuildOutputWorker,
	settings: ParsedOutputSettingsConfig | undefined
): BuildOutputPreviewWorker {
	const { manifest } = worker.config;
	let bundle: Bundle | undefined;
	if (manifest && worker.bundleDir) {
		bundle = {
			rootPath: worker.bundleDir,
			mainModule: manifest.mainModule,
			modules: manifest.modules,
		};
	}

	return {
		source: "build-output",
		config: worker.config,
		settings,
		assetsDir: worker.assetsDir,
		bundle,
	};
}
