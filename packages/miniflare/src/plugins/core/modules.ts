import assert from "node:assert";
import { pathToFileURL } from "node:url";
import { TextDecoder, TextEncoder } from "node:util";
import { type ModuleType } from "@cloudflare/config";
import type { Worker_Module } from "../../runtime";

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

type JavaScriptModuleRuleType = "ESModule" | "CommonJS";

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
			break;
		default:
			const exhaustive: never = type;
			assert.fail(`Unreachable: ${exhaustive} modules are unsupported`);
	}
}
