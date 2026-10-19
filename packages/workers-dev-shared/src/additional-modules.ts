import type { ModuleType } from "@cloudflare/config";

export const ADDITIONAL_MODULE_TYPES = [
	"CompiledWasm",
	"Data",
	"Text",
] as const;
export type AdditionalModuleType = (typeof ADDITIONAL_MODULE_TYPES)[number];

/**
 * Checks whether a string is an additional module type.
 *
 * @param type The string to check
 * @returns Whether `type` is an additional module type
 */
export function isAdditionalModuleType(
	type: string | undefined
): type is AdditionalModuleType {
	return ADDITIONAL_MODULE_TYPES.some((moduleType) => moduleType === type);
}

/**
 * Maps an additional module type to its Miniflare and Build Output module type.
 *
 * @param type The additional module type
 * @returns The module type
 */
export function toModuleType(type: AdditionalModuleType): ModuleType {
	switch (type) {
		case "CompiledWasm":
			return "wasm";
		case "Data":
			return "data";
		case "Text":
			return "text";
	}
}

type ModuleRules = Array<{
	type: AdditionalModuleType;
	pattern: RegExp;
}>;

const moduleRules: ModuleRules = [
	{ type: "CompiledWasm", pattern: /\.wasm(\?module)?$/ },
	{ type: "Data", pattern: /\.bin$/ },
	{ type: "Text", pattern: /\.(txt|html|sql)$/ },
];

const subpathImportRE = /^#/;

/** Import specifiers that may resolve to an additional module. */
export const moduleRuleFilters = [
	...moduleRules.map((rule) => rule.pattern),
	subpathImportRE,
];

/**
 * Matches a resolved module ID against the additional module rules.
 *
 * @param source The resolved module ID, including any query
 * @returns The additional module type, or `null` if it isn't an additional module
 */
export function matchAdditionalModule(
	source: string
): AdditionalModuleType | null {
	for (const rule of moduleRules) {
		if (rule.pattern.test(source)) {
			return rule.type;
		}
	}

	return null;
}

/** Matches imports of a `.wasm` file that return an instantiation helper. */
export const wasmInitRE = /\.wasm\?init$/;

/**
 * Generates the module for a `.wasm?init` import, which default exports a
 * function that instantiates the Wasm module.
 *
 * @param wasmPath The import specifier of the `.wasm` file, without the query
 * @returns The module's code
 */
export function getWasmInitModule(wasmPath: string): string {
	return `
					import wasm from "${wasmPath}";
					export default function(opts = {}) {
						return WebAssembly.instantiate(wasm, opts);
					}
				`;
}
