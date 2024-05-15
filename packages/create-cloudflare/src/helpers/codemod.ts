import { existsSync, lstatSync, readdirSync } from "fs";
import path, { extname, join } from "path";
import { crash } from "@cloudflare/cli";
import * as recast from "recast";
import * as esprimaParser from "recast/parsers/esprima";
import * as typescriptParser from "recast/parsers/typescript";
import { getTemplatePath } from "../templates";
import { readFile, writeFile } from "./files";
import type { Program } from "esprima";
import type { C3Context } from "types";

/*
  CODEMOD TIPS & TRICKS
  =====================

  More info about parsing and transforming can be found in the `recast` docs:
  https://github.com/benjamn/recast

  `recast` uses the `ast-types` library under the hood for basic AST operations
  and defining node types. If you need to manipulate or manually construct AST nodes as
  part of a code mod operation, be sure to check the `ast-types` documentation:
  https://github.com/benjamn/ast-types

  Last but not least, AST viewers can be extremely helpful when trying to write
  a transformer:
  - https://astexplorer.net/
  - https://ts-ast-viewer.com/#

*/

// Parse an input string as javascript and return an ast
export const parseJs = (src: string) => {
	src = src.trim();
	try {
		return recast.parse(src, { parser: esprimaParser });
	} catch (error) {
		crash("Error parsing js template.");
	}
};

// Parse an input string as typescript and return an ast
export const parseTs = (src: string) => {
	src = src.trim();
	try {
		return recast.parse(src, { parser: typescriptParser });
	} catch (error) {
		crash("Error parsing ts template.");
	}
};

// Parse a provided file with recast and return an ast
// Selects the correct parser based on the file extension
export const parseFile = (filePath: string) => {
	const lang = path.extname(filePath).slice(1);
	const parser = lang === "js" ? esprimaParser : typescriptParser;

	try {
		const fileContents = readFile(path.resolve(filePath));

		if (fileContents) {
			return recast.parse(fileContents, { parser }).program as Program;
		}
	} catch (error) {
		crash(`Error parsing file: ${filePath}`);
	}

	return null;
};

// Transform a file with the provided transformer methods and write it back to disk
export const transformFile = (
	filePath: string,
	methods: recast.types.Visitor,
) => {
	const ast = parseFile(filePath);

	if (ast) {
		recast.visit(ast, methods);
		writeFile(filePath, recast.print(ast).code);
	}
};

export const loadSnippets = (parentFolder: string) => {
	const snippetsPath = join(parentFolder, "snippets");

	if (!existsSync(snippetsPath)) {
		return {};
	}

	if (!lstatSync(snippetsPath).isDirectory) {
		return {};
	}

	const files = readdirSync(snippetsPath);

	return (
		files
			// don't try loading directories
			.filter((fileName) => lstatSync(join(snippetsPath, fileName)).isFile)
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
