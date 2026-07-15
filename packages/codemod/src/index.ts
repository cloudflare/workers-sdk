import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as recast from "recast";
import * as babelParser from "recast/parsers/babel";
import * as typescriptParser from "recast/parsers/typescript";
import type { Program } from "esprima";

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
export function parseJs(src: string) {
	src = src.trim();
	try {
		return recast.parse(src, { parser: babelParser });
	} catch (e) {
		throw new Error(`Error parsing JavaScript code: ${(e as Error).toString()}`);
	}
}

// Parse an input string as typescript and return an ast
export function parseTs(src: string) {
	src = src.trim();
	try {
		return recast.parse(src, { parser: typescriptParser });
	} catch (e) {
		throw new Error(`Error parsing TypeScript code: ${(e as Error).toString()}`);
	}
}

// Parse a provided file with recast and return an ast
// Selects the correct parser based on the file extension
export function parseFile(filePath: string) {
	const lang = path.extname(filePath).slice(1);
	const parser = lang === "js" ? parseJs : parseTs;
	let fileContents: string
	try {
		fileContents = readFileSync(path.resolve(filePath), "utf-8");
	} catch {
		throw new Error(`Error reading file ${filePath} for parsing`);
	}

	if (fileContents) {
		return parser(fileContents).program as Program;
	}

	return null;
}

// Transform a file with the provided transformer methods and write it back to disk
export function transformFile(filePath: string, methods: recast.types.Visitor) {
	const ast = parseFile(filePath);

	if (ast) {
		recast.visit(ast, methods);
		writeFileSync(filePath, recast.print(ast).code);
	}
}

/**
 * merges provided properties into a given object (updating the object itself), deeply merging them in case
 * some properties are object themselves
 *
 * @param sourceObject the object into which merge the new properties
 * @param newProperties the new properties to add/merge
 */
export function mergeObjectProperties(
	sourceObject: recast.types.namedTypes.ObjectExpression,
	newProperties: recast.types.namedTypes.ObjectProperty[]
): void {
	newProperties.forEach((newProp) => {
		const newPropName = getPropertyName(newProp);
		if (!newPropName) {
			return false;
		}
		const indexOfExisting = sourceObject.properties.findIndex(
			(p) => p.type === "ObjectProperty" && getPropertyName(p) === newPropName
		);

		const existing = sourceObject.properties[indexOfExisting];
		if (!existing) {
			sourceObject.properties.push(newProp);
			return;
		}

		if (
			existing.type === "ObjectProperty" &&
			existing.value.type === "ObjectExpression" &&
			newProp.value.type === "ObjectExpression"
		) {
			mergeObjectProperties(
				existing.value,
				newProp.value.properties as recast.types.namedTypes.ObjectProperty[]
			);
			return;
		}

		sourceObject.properties[indexOfExisting] = newProp;
	});
}

function getPropertyName(newProp: recast.types.namedTypes.ObjectProperty) {
	return newProp.key.type === "Identifier"
		? newProp.key.name
		: newProp.key.type === "StringLiteral"
			? newProp.key.value
			: null;
}
