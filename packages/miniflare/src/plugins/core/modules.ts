import assert from "node:assert";
import { pathToFileURL } from "node:url";
import { TextDecoder, TextEncoder } from "node:util";
import { type ModuleType } from "@cloudflare/config";
import { z } from "zod";
import { globsToRegExps, PathSchema } from "../../shared";
import type { Worker_Module } from "../../runtime";
import type { MatcherRegExps } from "../../workers";

// Module identifier used if script came from `script` option
export function buildStringScriptPath(workerIndex: number) {
	return `script-${workerIndex}`;
}
const stringScriptRegexp = /^script-(\d+)$/;
export function maybeGetStringScriptPathIndex(
	scriptPath: string
): number | undefined {
	const match = stringScriptRegexp.exec(scriptPath);
	return match === null ? undefined : parseInt(match[1]);
}

export const ModuleRuleTypeSchema = z.enum([
	"ESModule",
	"CommonJS",
	"Text",
	"Data",
	"CompiledWasm",
	"PythonModule",
	"PythonRequirement",
]);
export type ModuleRuleType = z.infer<typeof ModuleRuleTypeSchema>;

type JavaScriptModuleRuleType = "ESModule" | "CommonJS";

export const ModuleRuleSchema = z.object({
	type: ModuleRuleTypeSchema,
	include: z.string().array(),
	fallthrough: z.boolean().optional(),
});
export type ModuleRule = z.infer<typeof ModuleRuleSchema>;

// Manually defined module
export const ModuleDefinitionSchema = z.object({
	type: ModuleRuleTypeSchema,
	path: PathSchema,
	contents: z.string().or(z.instanceof(Uint8Array)).optional(),
});
export type ModuleDefinition = z.infer<typeof ModuleDefinitionSchema>;

export const SourceOptionsSchema = z.union([
	z.object({
		// Manually defined modules
		// (used by Wrangler which has its own module collection code)
		modules: z.array(ModuleDefinitionSchema),
		// `modules` "name"s will be their paths relative to this value.
		// This ensures file paths in stack traces are correct.
		modulesRoot: PathSchema.optional(),
	}),
	z.object({
		script: z.string(),
		// Optional script path for resolving modules, and stack traces file names
		scriptPath: PathSchema.optional(),
		// Automatically collect modules by parsing `script` if `true`, or treat as
		// service-worker if `false`
		modules: z.boolean().optional(),
		// How to interpret automatically collected modules
		modulesRules: z.array(ModuleRuleSchema).optional(),
		// `modules` "name"s will be their paths relative to this value.
		// This ensures file paths in stack traces are correct.
		modulesRoot: PathSchema.optional(),
	}),
	z.object({
		scriptPath: PathSchema,
		// Automatically collect modules by parsing `scriptPath` if `true`, or treat
		// as service-worker if `false`
		modules: z.boolean().optional(),
		// How to interpret automatically collected modules
		modulesRules: z.array(ModuleRuleSchema).optional(),
		// `modules` "name"s will be their paths relative to this value.
		// This ensures file paths in stack traces are correct.
		modulesRoot: PathSchema.optional(),
	}),
]);
export type SourceOptions = z.infer<typeof SourceOptionsSchema>;

export interface CompiledModuleRule {
	type: ModuleRuleType;
	include: MatcherRegExps;
}

export function compileModuleRules(rules: ModuleRule[]) {
	const compiledRules: CompiledModuleRule[] = [];
	const finalisedTypes = new Set<ModuleRuleType>();
	for (const rule of rules) {
		// Ignore rule if type didn't enable fallthrough
		if (finalisedTypes.has(rule.type)) continue;
		compiledRules.push({
			type: rule.type,
			include: globsToRegExps(rule.include, { endAnchor: true }),
		});
		if (!rule.fallthrough) finalisedTypes.add(rule.type);
	}
	return compiledRules;
}

export function withSourceURL(script: string, scriptPath: string): string {
	// If we've already got a `//# sourceURL` comment, return `script` as is
	// (searching from the end as that's where we'd expect it)
	if (script.lastIndexOf("//# sourceURL=") !== -1) return script;

	let scriptURL: URL | string = scriptPath;
	if (maybeGetStringScriptPathIndex(scriptPath) === undefined) {
		scriptURL = pathToFileURL(scriptPath);
	}
	// Make sure `//# sourceURL` comment is on its own line
	const sourceURL = `\n//# sourceURL=${scriptURL}\n`;
	return script + sourceURL;
}

function createJavaScriptModule(
	code: string,
	name: string,
	modulePath: string,
	type: JavaScriptModuleRuleType
): Worker_Module {
	code = withSourceURL(code, modulePath);
	if (type === "ESModule") {
		return { name, esModule: code };
	} else if (type === "CommonJS") {
		return { name, commonJsModule: code };
	}
	// noinspection UnnecessaryLocalVariableJS
	const exhaustive: never = type;
	assert.fail(`Unreachable: ${exhaustive} JavaScript modules are unsupported`);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export function contentsToString(contents: string | Uint8Array): string {
	return typeof contents === "string" ? contents : decoder.decode(contents);
}
function contentsToArray(contents: string | Uint8Array): Uint8Array {
	return typeof contents === "string" ? encoder.encode(contents) : contents;
}
/**
 * Converts a single manifest module (config `ModuleType` + inline contents)
 * into a workerd `Worker_Module`. The module `name` is used as-is (manifest
 * names are already relative module identifiers).
 */
export function convertManifestModule(
	name: string,
	type: ModuleType,
	contents: string | Uint8Array
): Worker_Module {
	switch (type) {
		case "esm":
			return createJavaScriptModule(
				contentsToString(contents),
				name,
				name,
				"ESModule"
			);
		case "cjs":
			return createJavaScriptModule(
				contentsToString(contents),
				name,
				name,
				"CommonJS"
			);
		case "wasm":
			return { name, wasm: contentsToArray(contents) };
		case "text":
			return { name, text: contentsToString(contents) };
		case "data":
			return { name, data: contentsToArray(contents) };
		case "json":
			return { name, json: contentsToString(contents) };
		case "python":
			return { name, pythonModule: contentsToString(contents) };
		case "python-requirement":
			return { name, pythonRequirement: contentsToString(contents) };
		case "sourcemap":
			assert.fail("Unreachable: sourcemap modules are unsupported");
		default:
			const exhaustive: never = type;
			assert.fail(`Unreachable: ${exhaustive} modules are unsupported`);
	}
}

/**
 * Maps a manifest `ModuleType` to the `ModuleRuleType` used by `SourceOptions`
 * (for stack-trace source mapping). The exact JavaScript/binary distinction
 * doesn't matter here — source mapping only reads a module's `path` and
 * `contents` — so non-JavaScript types collapse to `Text`.
 */
export function manifestModuleTypeToRuleType(type: ModuleType): ModuleRuleType {
	switch (type) {
		case "esm":
			return "ESModule";
		case "cjs":
			return "CommonJS";
		case "wasm":
			return "CompiledWasm";
		case "data":
			return "Data";
		case "python":
			return "PythonModule";
		case "python-requirement":
			return "PythonRequirement";
		case "text":
		case "json":
		case "sourcemap":
			return "Text";
		default:
			const exhaustive: never = type;
			assert.fail(`Unreachable: unknown module type ${exhaustive}`);
	}
}
