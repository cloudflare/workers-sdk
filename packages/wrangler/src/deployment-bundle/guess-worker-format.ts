import path from "node:path";
import * as esbuild from "esbuild";
import { logger } from "../logger";
import { COMMON_ESBUILD_OPTIONS } from "./bundle";
import { getEntryPointFromMetafile } from "./entry-point-from-metafile";
import type { CfScriptFormat } from "./worker";

/**
 * A function to "guess" the type of worker.
 * We do this by running a lightweight build of the actual script,
 * and looking at the meta-file generated by esbuild. If it has a default
 * export (or really, any exports), that means it's a "modules" worker.
 * Else, it's a "service-worker" worker. This seems hacky, but works remarkably
 * well in practice.
 */
export default async function guessWorkerFormat(
	entryFile: string,
	entryWorkingDirectory: string,
	tsconfig?: string | undefined
): Promise<{ format: CfScriptFormat; exports: string[] }> {
	const parsedEntryPath = path.parse(entryFile);
	if (parsedEntryPath.ext == ".py") {
		logger.warn(
			`The entrypoint ${path.relative(
				process.cwd(),
				entryFile
			)} defines a Python worker, support for Python workers is currently experimental. Python workers with a requirements.txt file can only be run locally and cannot be deployed.`
		);
		return { format: "modules", exports: [] };
	}

	const result = await esbuild.build({
		...COMMON_ESBUILD_OPTIONS,
		entryPoints: [entryFile],
		absWorkingDir: entryWorkingDirectory,
		metafile: true,
		bundle: false,
		write: false,
		...(tsconfig && { tsconfig }),
		logLevel: "silent",
	});

	// result.metafile is defined because of the `metafile: true` option above.
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const metafile = result.metafile!;

	const { exports } = getEntryPointFromMetafile(entryFile, metafile);
	let guessedWorkerFormat: CfScriptFormat;
	if (exports.length > 0) {
		if (exports.includes("default")) {
			guessedWorkerFormat = "modules";
		} else {
			logger.warn(
				`The entrypoint ${path.relative(
					process.cwd(),
					entryFile
				)} has exports like an ES Module, but hasn't defined a default export like a module worker normally would. Building the worker using "service-worker" format...`
			);
			guessedWorkerFormat = "service-worker";
		}
	} else {
		guessedWorkerFormat = "service-worker";
	}

	return { format: guessedWorkerFormat, exports };
}
