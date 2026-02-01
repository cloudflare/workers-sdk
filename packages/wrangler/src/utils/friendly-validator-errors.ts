import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ParseError } from "@cloudflare/workers-utils";
import dedent from "ts-dedent";
import { analyseBundle } from "../commands/check/commands";
import { logger } from "../logger";
import { getWranglerTmpDir } from "../paths";
import type { Metafile } from "esbuild";
import type { FormData } from "undici";

export async function helpIfErrorIsSizeOrScriptStartup(
	err: unknown,
	dependencies: { [path: string]: { bytesInOutput: number } },
	workerBundle: FormData | string,
	projectRoot: string | undefined
): Promise<string | null> {
	if (errIsScriptSize(err)) {
		return await diagnoseScriptSizeError(err, dependencies);
	}
	if (errIsStartupErr(err)) {
		return await diagnoseStartupError(err, workerBundle, projectRoot);
	}
	return null;
}

/**
 * Returns a formatted error message that describes the script size error.
 * It includes the largest dependencies if available.
 */
export function diagnoseScriptSizeError(
	err: ParseError,
	dependencies: { [path: string]: { bytesInOutput: number } }
): string {
	let message = dedent`
		Your Worker failed validation because it exceeded size limits.

		${err.text}
		${err.notes.map((note) => ` - ${note.text}`).join("\n")}
		`;

	const dependenciesMessage = getOffendingDependenciesMessage(dependencies);
	if (dependenciesMessage) {
		message += dependenciesMessage;
	}

	return message;
}

/**
 * Returns a formatted error message that describes the startup error.
 * If profiling is successful, it will include a link to the generated CPU profile.
 */
export async function diagnoseStartupError(
	err: ParseError,
	workerBundle: FormData | string,
	projectRoot: string | undefined
): Promise<string> {
	let errorMessage = dedent`
		Your Worker failed validation because it exceeded startup limits.

		${err.text}
		${err.notes.map((note) => ` - ${note.text}`).join("\n")}

		To ensure fast responses, there are constraints on Worker startup, such as how much CPU it can use, or how long it can take. Your Worker has hit one of these startup limits. Try reducing the amount of work done during startup (outside the event handler), either by removing code or relocating it inside the event handler.

		Refer to https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time for more details`;

	try {
		const cpuProfile = await analyseBundle(workerBundle);
		const tmpDir = await getWranglerTmpDir(
			projectRoot,
			"startup-profile",
			false
		);
		const profile = path.relative(
			projectRoot ?? process.cwd(),
			path.join(tmpDir.path, `worker.cpuprofile`)
		);
		await writeFile(profile, JSON.stringify(cpuProfile));

		errorMessage += dedent`

			A CPU Profile of your Worker's startup phase has been written to ${profile} - load it into the Chrome DevTools profiler (or directly in VSCode) to view a flamegraph.`;
	} catch (profilingError) {
		logger.debug(
			`An error occurred while trying to locally profile the Worker: ${profilingError}`
		);
	}

	return errorMessage;
}

/**
 * Gets a message that describes the largest dependencies in the script or `null` if there are none.
 */
function getOffendingDependenciesMessage(
	dependencies: Metafile["outputs"][string]["inputs"]
): string | null {
	const dependenciesSorted = Object.entries(dependencies);
	if (dependenciesSorted.length === 0) {
		return null;
	}

	dependenciesSorted.sort(
		([, aData], [, bData]) => bData.bytesInOutput - aData.bytesInOutput
	);

	const topLargest = dependenciesSorted.slice(0, 5);
	const ONE_KIB_BYTES = 1024;
	return [
		"",
		`Here are the ${topLargest.length} largest dependencies included in your script:`,
		"",
		...topLargest.map(
			([dep, data]) =>
				`- ${dep} - ${(data.bytesInOutput / ONE_KIB_BYTES).toFixed(2)} KiB`
		),
		"",
		"If these are unnecessary, consider removing them",
		"",
	].join("\n");
}

/**
 * Returns true if the error is a script size error.
 */
function errIsScriptSize(err: unknown): err is ParseError & { code: 10027 } {
	if (!(err instanceof ParseError)) {
		return false;
	}

	// 10027 = workers.api.error.script_too_large
	if ("code" in err && err.code === 10027) {
		return true;
	}

	return false;
}

/**
 * Returns true if the error is a startup error.
 */
function errIsStartupErr(err: unknown): err is ParseError & { code: 10021 } {
	if (!(err instanceof ParseError)) {
		return false;
	}

	// 10021 = validation error
	// no explicit error code for more granular errors than "invalid script"
	// but the error will contain a string error message directly from the
	// validator.
	// the error always SHOULD look like "Script startup exceeded CPU limit."
	// (or the less likely "Script startup exceeded memory limits.")
	if (
		"code" in err &&
		err.code === 10021 &&
		/startup/i.test(err.notes[0]?.text)
	) {
		return true;
	}

	return false;
}
