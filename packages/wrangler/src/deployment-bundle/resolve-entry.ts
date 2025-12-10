import path from "node:path";
import { getBasePath } from "../paths";
import type { Config } from "@cloudflare/workers-utils";

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
	// The project root is where the user defined the Worker via the Wrangler configuration (or the current working directory).
	// The entry root is the base path used in bundling the source code for the Worker,
	// which may be different from the project root if the Wrangler was redirected to use a different Wrangler configuration file.
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
