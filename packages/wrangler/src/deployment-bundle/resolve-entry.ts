import path from "path";
import { getBasePath } from "../paths";
import type { Config } from "../config";

export function resolveEntryWithScript(script: string): {
	absolutePath: string;
	relativePath: string;
} {
	const file = path.resolve(script);
	const relativePath = path.relative(process.cwd(), file) || ".";
	return { absolutePath: file, relativePath };
}

export function resolveEntryWithMain(
	main: string,
	config: Config
): {
	absolutePath: string;
	relativePath: string;
	projectRoot: string;
} {
	const projectRoot = path.resolve(path.dirname(config.userConfigPath ?? "."));
	const entryRoot = path.resolve(path.dirname(config.configPath ?? "."));
	const absolutePath = path.resolve(entryRoot, main);
	const relativePath = path.relative(entryRoot, absolutePath) || ".";
	return { absolutePath, relativePath, projectRoot };
}

export function resolveEntryWithEntryPoint(
	entryPoint: string,
	config: Config
): {
	absolutePath: string;
	relativePath: string;
	projectRoot: string;
} {
	const projectRoot = path.resolve(path.dirname(config.userConfigPath ?? "."));
	const entryRoot = path.resolve(path.dirname(config.configPath ?? "."));
	const file = path.extname(entryPoint)
		? path.resolve(entryPoint)
		: path.resolve(entryPoint, "index.js");
	const relativePath = path.relative(entryRoot, file) || ".";
	return { absolutePath: file, relativePath, projectRoot };
}

export function resolveEntryWithAssets(): {
	absolutePath: string;
	relativePath: string;
} {
	const file = path.resolve(getBasePath(), "templates/no-op-worker.js");
	const relativePath = path.relative(process.cwd(), file) || ".";
	return { absolutePath: file, relativePath };
}
