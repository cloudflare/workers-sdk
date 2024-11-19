import path from "path";
import { getBasePath } from "../paths";

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
	configPath?: string
): {
	absolutePath: string;
	relativePath: string;
	projectRoot: string;
} {
	const projectRoot = path.resolve(path.dirname(configPath ?? "."));
	const file = path.resolve(projectRoot, main);
	const relativePath = path.relative(projectRoot, file) || ".";
	return { absolutePath: file, relativePath, projectRoot };
}

export function resolveEntryWithEntryPoint(
	entryPoint: string,
	configPath?: string
): {
	absolutePath: string;
	relativePath: string;
	projectRoot: string;
} {
	const projectRoot = path.resolve(path.dirname(configPath ?? "."));
	const file = path.extname(entryPoint)
		? path.resolve(entryPoint)
		: path.resolve(entryPoint, "index.js");
	const relativePath = path.relative(projectRoot, file) || ".";
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
