import path from "path";
import * as recast from "recast";
import * as esprimaParser from "recast/parsers/esprima";
import * as typescriptParser from "recast/parsers/typescript";
import { crash } from "./cli";
import { readFile, writeFile } from "./files";
import type { Program } from "esprima";

// Parse an input string as javascript and return an ast
export const parseJs = (src: string) => {
	try {
		return recast.parse(src, { parser: esprimaParser });
	} catch (error) {
		crash("Error parsing js template.");
	}
};

// Parse an input string as typescript and return an ast
export const parseTs = (src: string) => {
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
			return recast.parse(fileContents, { parser }) as Program;
		}
	} catch (error) {
		crash(`Error parsing file: ${filePath}`);
	}

	return null;
};

// Transform a file with the provided transformer methods and write it back to disk
export const transformFile = (
	filePath: string,
	methods: recast.types.Visitor
) => {
	const ast = parseFile(filePath);

	if (ast) {
		recast.visit(ast, methods);
		writeFile(filePath, recast.print(ast).code);
	}
};
