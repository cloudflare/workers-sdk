import { writeFileSync } from "node:fs";
import { applyEdits, format, modify } from "jsonc-parser";
import TOML from "smol-toml";
import { parseJSONC, parseTOML, readFileSync } from "../parse";
import type { RawConfig } from "./config";
import type { JSONPath } from "jsonc-parser";

export const experimental_patchConfig = (
	configPath: string,
	/**
	 * if you want to add something new, e.g. a binding, you can just provide that {kv_namespace:[{binding:"KV"}]}
	 * and set isArrayInsertion = true
	 *
	 * if you want to edit or delete existing array elements, you have to provide the whole array
	 * e.g. {kv_namespace:[{binding:"KV", id:"new-id"}, {binding:"KV2", id:"untouched"}]}
	 * and set isArrayInsertion = false
	 */
	patch: RawConfig,
	isArrayInsertion: boolean = true
) => {
	let configString = readFileSync(configPath);

	if (configPath.endsWith("toml")) {
		// the TOML parser we use does not preserve comments
		if (configString.includes("#")) {
			throw new PatchConfigError(
				"cannot patch .toml config if comments are present"
			);
		} else {
			// for simplicity, use the JSONC editor to make all edits
			// toml -> js object -> json string -> edits -> js object -> toml
			configString = JSON.stringify(parseTOML(configString));
		}
	}

	const patchPaths: JSONPath[] = [];
	getJSONPath(patch, patchPaths, isArrayInsertion);
	for (const patchPath of patchPaths) {
		const value = patchPath.pop();
		const edit = modify(configString, patchPath, value, {
			isArrayInsertion,
		});
		configString = applyEdits(configString, edit);
	}
	const formatEdit = format(configString, undefined, {});
	configString = applyEdits(configString, formatEdit);

	if (configPath.endsWith(".toml")) {
		configString = TOML.stringify(parseJSONC(configString));
	}
	writeFileSync(configPath, configString);
	return configString;
};

/**
 *
 * Gets all the JSON paths for a given object by recursing through the object, recording the properties encountered.
 * e.g. {a : { b: "c", d: ["e", "f"]}} -> [["a", "b", "c"], ["a", "d", 0], ["a", "d", 1]]
 * The jsonc-parser library requires JSON paths for each edit.
 * Note the final 'path' segment is the value we want to insert,
 * so in the above example,["a", "b"] would be the path and we would insert "c"
 *
 * If isArrayInsertion = false, when we encounter an array, we use the item index as part of the path and continue
 * If isArrayInsertion = false, we stop recursing down and treat the whole array item as the final path segment/value.
 *
 */
const getJSONPath = (
	obj: RawConfig,
	allPaths: JSONPath[],
	isArrayInsertion: boolean,
	prevPath: JSONPath = []
) => {
	for (const [k, v] of Object.entries(obj)) {
		const currentPath = [...prevPath, k];
		if (Array.isArray(v)) {
			v.forEach((x, i) => {
				if (isArrayInsertion) {
					// makes sure we insert new array items at the end
					allPaths.push([...currentPath, -1, x]);
				} else if (typeof x === "object" && x !== null) {
					getJSONPath(x, allPaths, isArrayInsertion, [...currentPath, i]);
				} else {
					allPaths.push([...currentPath, i, x]);
				}
			});
		} else if (typeof v === "object" && v !== null) {
			getJSONPath(v, allPaths, isArrayInsertion, currentPath);
		} else {
			allPaths.push([...currentPath, v]);
		}
	}
};

/**
 * Custom error class for config patching errors
 */
export class PatchConfigError extends Error {}
