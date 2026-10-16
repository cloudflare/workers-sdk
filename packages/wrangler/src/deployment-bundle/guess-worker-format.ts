import path from "node:path";
import * as esbuild from "esbuild";
import { logger } from "../logger";
import { COMMON_ESBUILD_OPTIONS } from "./bundle";
import { getEntryPointFromMetafile } from "./entry-point-from-metafile";
import type { CfScriptFormat } from "@cloudflare/workers-utils";

const SERVICE_WORKER_EVENT_LISTENER =
	"__WRANGLER_SERVICE_WORKER_EVENT_LISTENER__";

/**
 * Guesses the Worker format by running a lightweight build and inspecting its
 * generated exports. For JavaScript and TypeScript entrypoints, the heuristic
 * is:
 *
 * - No exports: Service Worker, regardless of event listener syntax.
 * - A default export: Module Worker.
 * - Named-only exports are ambiguous:
 *   - A recognized global `addEventListener` reference: Service Worker.
 *   - No recognized global `addEventListener` reference: Module Worker.
 *
 * An `addEventListener` reference does not necessarily need to be a call that
 * registers an event listener.
 */
export async function guessWorkerFormat(
	entryFile: string,
	entryWorkingDirectory: string,
	tsconfig?: string | undefined
): Promise<{ format: CfScriptFormat; exports: string[] }> {
	const parsedEntryPath = path.parse(entryFile);
	if (parsedEntryPath.ext == ".py") {
		return { format: "modules", exports: [] };
	}

	// Let esbuild mark references to the global binding so strings, comments, and
	// locally shadowed functions named `addEventListener` aren't false positives.
	// The marker identifies references, without determining how they are used.
	const result = await esbuild.build({
		...COMMON_ESBUILD_OPTIONS,
		entryPoints: [entryFile],
		absWorkingDir: entryWorkingDirectory,
		metafile: true,
		bundle: false,
		write: false,
		...(tsconfig && { tsconfig }),
		define: {
			addEventListener: SERVICE_WORKER_EVENT_LISTENER,
			"globalThis.addEventListener": SERVICE_WORKER_EVENT_LISTENER,
			"self.addEventListener": SERVICE_WORKER_EVENT_LISTENER,
		},
		logLevel: "silent",
	});

	// result.metafile is defined because of the `metafile: true` option above.
	const metafile = result.metafile;

	const { exports } = getEntryPointFromMetafile(entryFile, metafile);
	const usesServiceWorkerEventListener = result.outputFiles.some(({ text }) =>
		text.includes(SERVICE_WORKER_EVENT_LISTENER)
	);

	let guessedWorkerFormat: CfScriptFormat;
	if (exports.length === 0) {
		guessedWorkerFormat = "service-worker";
	} else if (exports.includes("default")) {
		guessedWorkerFormat = "modules";
	} else if (usesServiceWorkerEventListener) {
		logger.warn(
			`The entrypoint ${path.relative(
				process.cwd(),
				entryFile
			)} has exports like an ES Module, but hasn't defined a default export like a module worker normally would. Building the worker using "service-worker" format...`
		);
		guessedWorkerFormat = "service-worker";
	} else {
		guessedWorkerFormat = "modules";
	}

	return { format: guessedWorkerFormat, exports };
}
