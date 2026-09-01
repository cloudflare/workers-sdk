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
	config: ParsedOutputWorkerConfig;
	assetsDir: string | undefined;
	bundle: Bundle | undefined;
}

export interface BuildOutputPreview {
	settings: ParsedOutputSettingsConfig | undefined;
	workers: BuildOutputPreviewWorker[];
}

/**
 * Read the Build Output Specification and select the Worker used for preview.
 * During prerendering, the `prerender` directory is preferred when present;
 * ordinary preview uses the `default` directory.
 */
export async function readBuildOutputPreview(
	root: string,
	isPrerender: boolean
): Promise<BuildOutputPreview> {
	// `settings` comes from the top-level `config.json` holding project-level
	// settings (`account_id`, `compliance_region`) shared by every Worker. It
	// also carries the `mode` the build ran in, which preview uses to select
	// local env files.
	const { workers, settings } = await readBuildOutput(root);
	const defaultWorker = workers[DEFAULT_WORKER_DIRECTORY_NAME];
	const worker = isPrerender
		? (workers[PRERENDER_WORKER_DIRECTORY_NAME] ?? defaultWorker)
		: defaultWorker;

	return { settings, workers: [toPreviewWorker(worker)] };
}

function toPreviewWorker(worker: BuildOutputWorker): BuildOutputPreviewWorker {
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
		config: worker.config,
		assetsDir: worker.assetsDir,
		bundle,
	};
}
