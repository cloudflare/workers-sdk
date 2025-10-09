import { getBundleType } from "./bundle-type";
import {
	findAdditionalModules,
	writeAdditionalModules,
} from "./find-additional-modules";
import type { Rule } from "../config/environment";
import type { Entry } from "./entry";

export async function noBundleWorker(
	entry: Entry,
	rules: Rule[],
	outDir: string | undefined,
	pythonModulesExcludes: string[] = []
) {
	const modules = await findAdditionalModules(
		entry,
		rules,
		false,
		pythonModulesExcludes
	);
	if (outDir) {
		await writeAdditionalModules(modules, outDir);
	}

	const bundleType = getBundleType(entry.format, entry.file);
	return {
		modules,
		dependencies: {} as { [path: string]: { bytesInOutput: number } },
		resolvedEntryPointPath: entry.file,
		bundleType,
	};
}
