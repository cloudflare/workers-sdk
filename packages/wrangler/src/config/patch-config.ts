import { writeFileSync } from "fs";
import TOML from "@iarna/toml";
import { applyEdits, format, modify } from "jsonc-parser";
import { parseJSONC, parseTOML, readFileSync } from "../parse";
import type { RawConfig } from "./config";
import type { JSONPath } from "jsonc-parser";

export const experimental_patchConfig = (
	configPath: string,
	patch: RawConfig
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
	getJSONPath(patch, patchPaths);
	for (const patchPath of patchPaths) {
		const value = patchPath.pop();
		const edit = modify(configString, patchPath, value, {
			isArrayInsertion: true,
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

// gets all the json paths for the patch which are needed to create the edit
const getJSONPath = (
	obj: RawConfig,
	allPaths: JSONPath[],
	prevPath: JSONPath = []
) => {
	for (const [k, v] of Object.entries(obj)) {
		const currentPath = [...prevPath, k];
		if (Array.isArray(v)) {
			v.forEach((x) => {
				// makes sure we insert new array items at the end
				// currently this function is additive, ie it assumes a patch with an array item should be added,
				// rather than replacing (modifying, deleting) an existing item at the index
				allPaths.push([...currentPath, -1, x]);
			});
		} else if (typeof v === "object") {
			getJSONPath(v, allPaths, currentPath);
		} else {
			allPaths.push([...currentPath, v]);
		}
	}
};

/**
 * Custom error class for config patching errors
 */
export class PatchConfigError extends Error {}
