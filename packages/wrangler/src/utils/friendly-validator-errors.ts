import { writeFile } from "node:fs/promises";
import path from "node:path";
import dedent from "ts-dedent";
import { analyseBundle } from "../check/commands";
import { printOffendingDependencies } from "../deployment-bundle/bundle-reporter";
import { UserError } from "../errors";
import { ParseError } from "../parse";
import { getWranglerTmpDir } from "../paths";
import type { FormData } from "undici";

function errIsScriptSize(err: unknown): err is { code: 10027 } {
	if (!err) {
		return false;
	}

	// 10027 = workers.api.error.script_too_large
	if ((err as { code: number }).code === 10027) {
		return true;
	}

	return false;
}
const scriptStartupErrorRegex = /startup/i;

function errIsStartupErr(err: unknown): err is ParseError & { code: 10021 } {
	if (!err) {
		return false;
	}

	// 10021 = validation error
	// no explicit error code for more granular errors than "invalid script"
	// but the error will contain a string error message directly from the
	// validator.
	// the error always SHOULD look like "Script startup exceeded CPU limit."
	// (or the less likely "Script startup exceeded memory limits.")
	if (
		(err as { code: number }).code === 10021 &&
		err instanceof ParseError &&
		scriptStartupErrorRegex.test(err.notes[0]?.text)
	) {
		return true;
	}

	return false;
}

export async function helpIfErrorIsSizeOrScriptStartup(
	err: unknown,
	dependencies: { [path: string]: { bytesInOutput: number } },
	workerBundle: FormData,
	projectRoot: string | undefined
) {
	if (errIsScriptSize(err)) {
		printOffendingDependencies(dependencies);
	} else if (errIsStartupErr(err)) {
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
		throw new UserError(dedent`
			Your Worker failed validation because it exceeded startup limits.
			To ensure fast responses, there are constraints on Worker startup, such as how much CPU it can use, or how long it can take. Your Worker has hit one of these startup limits. Try reducing the amount of work done during startup (outside the event handler), either by removing code or relocating it inside the event handler.

			A CPU Profile of your Worker's startup phase has been written to ${profile} - load it into the Chrome DevTools profiler (or directly in VSCode) to view a flamegraph.

			Refer to https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time for more details`);
	}
}
