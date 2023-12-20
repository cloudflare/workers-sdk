import fs from "node:fs";
import { pathToFileURL } from "url";
import type { CfModule } from "./worker";

export function withSourceURL(source: string, sourcePath: string) {
	return `${source}\n//# sourceURL=${pathToFileURL(sourcePath)}`;
}

/**
 * Adds `//# sourceURL` comments so V8 knows where source files are on disk.
 * These URLs are returned in `Debugger.scriptParsed` events, ensuring inspector
 * clients resolve source mapping URLs correctly. They also appear in stack
 * traces, allowing users to click through to where errors are thrown.
 */
export function withSourceURLs(
	entrypointPath: string,
	modules: CfModule[]
): { entrypointSource: string; modules: CfModule[] } {
	let entrypointSource = fs.readFileSync(entrypointPath, "utf8");
	entrypointSource = withSourceURL(entrypointSource, entrypointPath);

	modules = modules.map((module) => {
		if (
			module.filePath !== undefined &&
			(module.type === "esm" || module.type === "commonjs")
		) {
			// `module.content` may be a `Buffer`
			let newContent = module.content.toString();
			newContent = withSourceURL(newContent, module.filePath);
			return { ...module, content: newContent };
		} else {
			return module;
		}
	});

	return { entrypointSource, modules };
}
