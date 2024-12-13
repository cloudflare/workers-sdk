import TOML from "@iarna/toml";
import { applyEdits, format, parse as JSONCParse, modify } from "jsonc-parser";
import { parseTOML, readFileSync } from "../parse";
import type { RawConfig } from "./config";
import type { JSONPath } from "jsonc-parser";

export const experimental_patchConfig = (
	configPath: string | undefined,
	patch: RawConfig
) => {
	if (!configPath) {
		return;
	}

	let configString = readFileSync(configPath);

	if (configPath.endsWith("toml")) {
		// the TOML parser we use does not preserve comments
		if (configString.includes("#")) {
			return;
		} else {
			// for simplicity, use the JSONC editor to make all edits
			// toml -> js object -> json string -> edits -> js object -> toml
			configString = JSON.stringify(parseTOML(configString));
		}
	}

	const patchPaths: JSONPath[] = [];
	getPath(patch, patchPaths);
	for (const patchPath of patchPaths) {
		const value = patchPath.pop();
		const edit = modify(configString, patchPath, value, {
			isArrayInsertion: true,
		});
		configString = applyEdits(configString, edit);
		const formatEdit = format(configString, undefined, {});
		configString = applyEdits(configString, formatEdit);
	}

	if (configPath.endsWith(".toml")) {
		return TOML.stringify(JSONCParse(configString));
	}
	return configString;
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
