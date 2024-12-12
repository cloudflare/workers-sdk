import TOML from "@iarna/toml";
import { applyEdits, format, parse as JSONCParse, modify } from "jsonc-parser";
import { parseTOML, readFileSync } from "../parse";
import type { RawConfig } from "./config";
import type { JSONPath } from "jsonc-parser";

export const experimental_patchConfig = (
	configPath: string,
	patch: RawConfig
) => {
	// will be json shaped
	let raw = readFileSync(configPath);

	if (configPath.endsWith("toml")) {
		// what if they have a # in a string...?
		if (raw.includes("#")) {
			return;
		} else {
			// toml -> js object -> json string -> edits -> js object -> toml
			raw = JSON.stringify(parseTOML(raw));
		}
	} else if (!(configPath.endsWith("jsonc") || configPath.endsWith("json"))) {
		throw new Error("shouldn't get here?");
	}

	const patchPaths: JSONPath[] = [];
	getPath(patch, patchPaths);
	for (const patchPath of patchPaths) {
		const value = patchPath.pop();
		const edit = modify(raw, patchPath, value, { isArrayInsertion: true });
		raw = applyEdits(raw, edit);
		const formatEdit = format(raw, undefined, {});
		raw = applyEdits(raw, formatEdit);
	}

	if (configPath.endsWith(".toml")) {
		return TOML.stringify(JSONCParse(raw));
	}
	return raw;
};

const getPath = (
	obj: RawConfig,
	allPaths: JSONPath[],
	prevPath: JSONPath = []
) => {
	for (const [k, v] of Object.entries(obj)) {
		const currentPath = [...prevPath, k];
		if (Array.isArray(v)) {
			v.forEach((x) => {
				allPaths.push([...currentPath, -1, x]);
			});
		} else if (typeof v === "object") {
			getPath(v, allPaths, currentPath);
		} else {
			allPaths.push([...currentPath, v]);
		}
	}
};
