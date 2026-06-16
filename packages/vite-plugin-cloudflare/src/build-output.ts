import * as path from "node:path";
import type { ModuleType } from "@cloudflare/config";

export {
	BUILD_OUTPUT_VERSION,
	BUILD_OUTPUT_ROOT,
	WORKER_CONFIG_FILENAME,
	cleanBuildOutputDir,
	getWorkersDir,
	getWorkerConfigPath,
	getWorkerBundleDir,
	getWorkerAssetsDir,
	writeOutputWorkerConfig,
} from "@cloudflare/config";

/**
 * Map a bundle filename to its declared module type.
 */
export function detectModuleType(filename: string): ModuleType {
	const ext = path.extname(filename).toLowerCase();

	switch (ext) {
		case ".js":
		case ".mjs":
			return "esm";
		case ".wasm":
			return "wasm";
		case ".bin":
			return "data";
		case ".txt":
		case ".html":
		case ".sql":
			return "text";
		case ".json":
			return "json";
		case ".map":
			return "sourcemap";
		default:
			return "data";
	}
}
