import { ADDITIONAL_MODULE_TYPES } from "./constants";

type AdditionalModuleType = (typeof ADDITIONAL_MODULE_TYPES)[number];

type ModuleRules = Array<{
	type: AdditionalModuleType;
	extensions: string[];
}>;

const moduleRules: ModuleRules = [
	{ type: "CompiledWasm", extensions: [".wasm", ".wasm?module"] },
	{ type: "Data", extensions: [".bin"] },
	{ type: "Text", extensions: [".txt", ".html"] },
];

export function matchAdditionalModule(source: string) {
	for (const rule of moduleRules) {
		for (const extension of rule.extensions) {
			if (source.endsWith(extension)) {
				return rule.type;
			}
		}
	}

	return null;
}

export function createModuleReference(type: AdditionalModuleType, id: string) {
	return `__CLOUDFLARE_MODULE__${type}__${id}__`;
}
