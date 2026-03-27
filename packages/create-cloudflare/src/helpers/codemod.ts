import { lstatSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { parseFile } from "@cloudflare/codemod";
import { getTemplatePath } from "../templates";
import type * as recast from "recast";
import type { C3Context } from "types";

export const loadSnippets = (parentFolder: string) => {
	const snippetsPath = join(parentFolder, "snippets");

	if (!lstatSync(snippetsPath, { throwIfNoEntry: false })?.isDirectory()) {
		return {};
	}

	const files = readdirSync(snippetsPath);

	return (
		files
			// don't try loading directories
			.filter((fileName) => lstatSync(join(snippetsPath, fileName)).isFile())
			// only load js or ts files
			.filter((fileName) => [".js", ".ts"].includes(extname(fileName)))
			.reduce((acc, snippetPath) => {
				const [file, ext] = snippetPath.split(".");
				const key = `${file}${ext === "js" ? "Js" : "Ts"}`;
				return {
					...acc,
					[key]: parseFile(join(snippetsPath, snippetPath))?.body,
				};
			}, {}) as Record<string, recast.types.ASTNode[]>
	);
};

export const loadTemplateSnippets = (ctx: C3Context) => {
	return loadSnippets(getTemplatePath(ctx));
};
