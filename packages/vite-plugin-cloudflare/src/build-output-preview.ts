import {
	BuildOutputError,
	DEFAULT_WORKER_DIRECTORY_NAME,
	readBuildOutput,
} from "@cloudflare/build-output-utils";
import { PRERENDER_WORKER_DIRECTORY_NAME } from "./build-output";
import type { BuildOutputWorker } from "@cloudflare/build-output-utils";
import type {
	ModuleType,
	ParsedBuildOutputContainerConfig,
	ParsedBuildOutputRootConfig,
	ParsedBuildOutputWorkerConfig,
} from "@cloudflare/config";

export interface Bundle {
	rootPath: string;
	mainModule: string;
	modules: Record<string, { type: ModuleType }>;
}

export interface BuildOutputPreviewWorker {
	config: ParsedBuildOutputWorkerConfig;
	assetsDir: string | undefined;
	bundle: Bundle | undefined;
}

export interface BuildOutputPreview {
	rootConfig: ParsedBuildOutputRootConfig;
	containers: ParsedBuildOutputContainerConfig[];
	workers: BuildOutputPreviewWorker[];
}

/**
 * Read the Build Output Specification and select the Workers used for preview.
 * Every auxiliary Worker is always included. During prerendering, the
 * `prerender` Worker replaces the `default` entry Worker when present.
 */
export async function readBuildOutputPreview(
	root: string,
	isPrerender: boolean
): Promise<BuildOutputPreview> {
	// `rootConfig` comes from the top-level `config.json` holding project-level
	// settings and build context shared by every Worker.
	const { workers, rootConfig, containers } =
		await readPreviewBuildOutput(root);
	const defaultWorker = workers[DEFAULT_WORKER_DIRECTORY_NAME];
	const entryWorker = isPrerender
		? (workers[PRERENDER_WORKER_DIRECTORY_NAME] ?? defaultWorker)
		: defaultWorker;
	const auxiliaryWorkers = Object.entries(workers)
		.filter(([directoryName]) => {
			return (
				directoryName !== DEFAULT_WORKER_DIRECTORY_NAME &&
				directoryName !== PRERENDER_WORKER_DIRECTORY_NAME
			);
		})
		.map(([_, worker]) => worker);
	const selectedWorkers = [entryWorker, ...auxiliaryWorkers];

	return {
		rootConfig,
		containers: containers.map(({ config }) => config),
		workers: selectedWorkers.map(toPreviewWorker),
	};
}

/**
 * Read the Build Output, replacing the library's generic advice when the fix
 * is to rebuild.
 *
 * Preview reads the output this plugin wrote. If it is missing, in an older
 * format or alongside a stale tree, the build hasn't run since the plugin was
 * installed or upgraded, so upgrading isn't the fix.
 */
async function readPreviewBuildOutput(
	root: string
): ReturnType<typeof readBuildOutput> {
	try {
		return await readBuildOutput(root);
	} catch (error) {
		if (
			error instanceof BuildOutputError &&
			(error.code === "not-found" ||
				error.code === "older-version" ||
				error.code === "multiple-versions")
		) {
			const reason =
				error.code === "not-found"
					? "No Build Output was found to preview."
					: error.code === "older-version"
						? `The Build Output uses the older ${error.foundVersions?.join(", ")} format.`
						: `Build Output was found in more than one format (${error.foundVersions?.join(", ")}).`;
			throw new Error(`${reason} Build the project, then preview it again.`, {
				cause: error,
			});
		}
		throw error;
	}
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
