import { readdir } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { logger } from "./logger";
import { matchFiles, parseRules } from "./module-collection";
import type { BundleResult } from "./bundle";
import type { Config } from "./config";
import type { Entry } from "./entry";

async function getFiles(root: string, relativeTo: string): Promise<string[]> {
	const files = [];
	for (const file of await readdir(root, { withFileTypes: true })) {
		if (file.isDirectory()) {
			files.push(...(await getFiles(path.join(root, file.name), relativeTo)));
		} else {
			files.push(path.relative(relativeTo, path.join(root, file.name)));
		}
	}
	return files;
}

export default async function traverseModuleGraph(
	entry: Entry,
	rules: Config["rules"]
): Promise<BundleResult> {
	const files = await getFiles(entry.moduleRoot, entry.moduleRoot);
	const relativeEntryPoint = path.relative(entry.moduleRoot, entry.file);

	const modules = (await matchFiles(files, entry.moduleRoot, parseRules(rules)))
		.filter((m) => m.name !== relativeEntryPoint)
		.map((m) => ({
			...m,
			name: m.name,
		}));

	const bundleType = entry.format === "modules" ? "esm" : "commonjs";

	if (modules.length > 0) {
		logger.info(`Uploading additional modules:`);
		modules.forEach(({ name, type }) => {
			logger.info(`- ${chalk.blue(name)} (${chalk.green(type ?? "")})`);
		});
	}

	return {
		modules,
		dependencies: {},
		resolvedEntryPointPath: entry.file,
		bundleType,
		stop: undefined,
		sourceMapPath: undefined,
		sourceMapMetadata: undefined,
	};
}
