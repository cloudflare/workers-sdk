import { assign, parse, stringify } from "comment-json";
import { readFile, writeFile } from "./files";
import type {
	CommentDescriptor,
	CommentObject,
	CommentSymbol,
	CommentToken,
	Reviver,
} from "comment-json";

/**
 * Reads a JSON file and preserves comments.
 * @param jsonFilePath - The path to the JSON file.
 * @param reviver A function that transforms the results. This function is called for each member of the object.
 * @returns The parsed JSON object with comments.
 */
export function readJSONWithComments(
	jsonFilePath: string,
	reviver?: Reviver,
): CommentObject {
	const jsonString = readFile(jsonFilePath);
	const jsonObject = parse(jsonString, reviver) as unknown as CommentObject;
	return jsonObject;
}

/**
 * Writes a JSON object to a file, preserving comments.
 * @param jsonObject - The JSON object (with comment properties) to write.
 * @param jsonFilePath - The path to the JSON file.
 */
export function writeJSONWithComments(
	jsonFilePath: string,
	jsonObject: CommentObject,
): void {
	const jsonStr = stringify(jsonObject, null, "\t");
	writeFile(jsonFilePath, jsonStr);
}

/**
 * Adds a comment to a JSON configuration object that was loaded with comment-json.
 * @param jsonObject - The JSON object (with comment properties) to add comments to.
 * @param descriptor - The comment descriptor (e.g., "before-all", "after:propertyName").
 * @param comment - The comment(s) to add - can be a string, CommentToken object, or array of either.
 */
export function addJSONComment(
	jsonObject: Partial<CommentObject>,
	descriptor: CommentDescriptor,
	comment: string | Partial<CommentToken> | (string | Partial<CommentToken>)[],
): void {
	if (!Array.isArray(comment)) {
		comment = [comment];
	}

	const commentHolder =
		jsonObject[Symbol.for(descriptor) as CommentSymbol] ?? [];

	for (let c of comment) {
		if (typeof c === "string") {
			c = { value: c };
		}
		commentHolder.push({
			type: "BlockComment",
			value: "",
			inline: false,
			loc: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
			...c,
		});
	}

	jsonObject[Symbol.for(descriptor) as CommentSymbol] = commentHolder;
}

/**
 * Appends a property to a JSON configuration object.
 * @param jsonObject - The JSON configuration object.
 * @param property - The property to append.
 * @param value - The value of the property.
 * @returns A new JSON object with the property appended.
 */
export function appendJSONProperty<T>(
	jsonObject: T,
	property: string,
	value: unknown,
) {
	return assign(jsonObject, { [property]: value });
}

/**
 * Inserts a property into the start of a JSON configuration object.
 * @param jsonObject - The JSON configuration object.
 * @param property - The property to insert.
 * @param value - The value of the property.
 * @returns A new JSON object with the property inserted.
 */
export function insertJSONProperty<T>(
	jsonObject: T,
	property: string,
	value: unknown,
) {
	return assign({ [property]: value }, jsonObject) as CommentObject;
}
