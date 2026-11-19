import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as recast from "recast";
import * as babelParser from "recast/parsers/babel";
import * as typescriptParser from "recast/parsers/typescript";
import type { Program } from "esprima";

// Re-export the recast primitives needed to author string-in/string-out
// transforms without taking a direct dependency on `recast`: `print` (AST ->
// string) and the `ast-types` namespace `types` (node builders, `.check()`
// guards, and `types.visit`). Re-exported directly so `types` keeps its
// namespace and can be used in type positions.
export { print, types } from "recast";

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

/**
 * Parses JavaScript while preserving the source verbatim so transforms can
 * print unchanged files byte-for-byte.
 *
 * @param src JavaScript source to parse.
 * @returns The parsed AST.
 */
export function parseJs(src: string): recast.types.namedTypes.File {
	try {
		return recast.parse(src, { parser: babelParser });
	} catch {
		throw new Error("Error parsing js template.");
	}
}

/**
 * Parses TypeScript while preserving the source verbatim so transforms can
 * print unchanged files byte-for-byte.
 *
 * @param src TypeScript source to parse.
 * @returns The parsed AST.
 */
export function parseTs(src: string): recast.types.namedTypes.File {
	try {
		return recast.parse(src, { parser: typescriptParser });
	} catch {
		throw new Error("Error parsing ts template.");
	}
}

// Parse a provided file with recast and return an ast
// Selects the correct parser based on the file extension
export function parseFile(filePath: string) {
	const lang = path.extname(filePath).slice(1);
	const parser = lang === "js" ? babelParser : typescriptParser;

	try {
		const fileContents = readFileSync(path.resolve(filePath), "utf-8");

		if (fileContents) {
			return recast.parse(fileContents, { parser }).program as Program;
		}
	} catch {
		throw new Error(`Error parsing file: ${filePath}`);
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
 * some properties are objects themselves and concatenating them (de-duplicating string entries) in case
 * some properties are arrays
 *
 * objects and arrays are also merged into an existing value that isn't a literal, such as a variable or a call,
 * by spreading it, so that `vite: viteConfig` keeps its settings as
 * `vite: { ...viteConfig, plugins: [...(viteConfig?.plugins ?? []), cloudflare()] }`
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

		if (
			existing.type === "ObjectProperty" &&
			existing.value.type === "ArrayExpression" &&
			newProp.value.type === "ArrayExpression"
		) {
			mergeArrayElements(existing.value, newProp.value);
			return;
		}

		if (
			existing.type === "ObjectProperty" &&
			(newProp.value.type === "ObjectExpression" ||
				newProp.value.type === "ArrayExpression") &&
			!isLiteral(existing.value)
		) {
			// A shorthand such as `{ vite }` must be expanded to print as `vite: value`
			existing.shorthand = false;
			existing.value = spreadInto(existing.value as Expression, newProp.value);
			return;
		}

		sourceObject.properties[indexOfExisting] = newProp;
	});
}

type Expression = Parameters<typeof recast.types.builders.spreadElement>[0];

/**
 * merges new properties or elements into a value whose content isn't known without running the code,
 * by spreading the value before them, including into its nested values that the new ones extend
 *
 * @param value the existing value, such as a variable or a call
 * @param newValue the object or array to merge into it
 * @returns the merged expression
 */
function spreadInto(
	value: Expression,
	newValue:
		| recast.types.namedTypes.ObjectExpression
		| recast.types.namedTypes.ArrayExpression
): Expression {
	const b = recast.types.builders;
	if (newValue.type === "ArrayExpression") {
		return b.arrayExpression([b.spreadElement(value), ...newValue.elements]);
	}

	// `value?.key` needs parentheses around values such as `isDev ? a : b` to keep its meaning
	const object = [
		"Identifier",
		"MemberExpression",
		"OptionalMemberExpression",
		"CallExpression",
	].includes(value.type)
		? value
		: b.parenthesizedExpression(value);

	return b.objectExpression([
		b.spreadElement(value),
		...newValue.properties.map((prop) => {
			if (
				prop.type !== "ObjectProperty" ||
				(prop.value.type !== "ObjectExpression" &&
					prop.value.type !== "ArrayExpression")
			) {
				return prop;
			}
			const nested = b.optionalMemberExpression(
				object,
				prop.key,
				prop.key.type !== "Identifier",
				true
			);
			return b.objectProperty(
				prop.key,
				spreadInto(
					prop.value.type === "ArrayExpression"
						? b.logicalExpression("??", nested, b.arrayExpression([]))
						: nested,
					prop.value
				)
			);
		}),
	]);
}

/** whether a value is an object, array or primitive literal, which spreading wouldn't extend */
function isLiteral(
	value: recast.types.namedTypes.ObjectProperty["value"]
): boolean {
	return (
		value.type === "ObjectExpression" ||
		value.type === "ArrayExpression" ||
		recast.types.namedTypes.Literal.check(value)
	);
}

/**
 * concatenates the elements of one array expression onto another (updating the target array itself),
 * skipping any string literal that is already present so that existing entries are preserved rather
 * than overwritten
 *
 * @param existingArray the array expression to merge new elements into
 * @param newArray the array expression whose elements should be appended
 */
function mergeArrayElements(
	existingArray: recast.types.namedTypes.ArrayExpression,
	newArray: recast.types.namedTypes.ArrayExpression
): void {
	const existingStringValues = new Set(
		existingArray.elements
			.filter((el) => el?.type === "StringLiteral")
			.map((el) => el.value)
	);

	newArray.elements.forEach((el) => {
		if (el?.type === "StringLiteral") {
			if (existingStringValues.has(el.value)) {
				return;
			}
			existingStringValues.add(el.value);
		}
		existingArray.elements.push(el);
	});
}

function getPropertyName(newProp: recast.types.namedTypes.ObjectProperty) {
	return newProp.key.type === "Identifier"
		? newProp.key.name
		: newProp.key.type === "StringLiteral"
			? newProp.key.value
			: null;
}
