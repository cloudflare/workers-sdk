import assert from "assert";
import { readFileSync } from "fs";
import { builtinModules } from "module";
import path from "path";
import { TextDecoder, TextEncoder } from "util";
import { parse } from "acorn";
import { simple } from "acorn-walk";
import type estree from "estree";
import { dim } from "kleur/colors";
import { z } from "zod";
import { Worker_Module } from "../../runtime";
import {
	MatcherRegExps,
	MiniflareCoreError,
	globsToRegExps,
	testRegExps,
} from "../../shared";
import { SourceMapRegistry } from "../shared";

const SUGGEST_BUNDLE =
	"If you're trying to import an npm package, you'll need to bundle your Worker first.";
const SUGGEST_NODE =
	"If you're trying to import a Node.js built-in module, or an npm package " +
	"that uses Node.js built-ins, you'll either need to:" +
	"\n- Bundle your Worker, configuring your bundler to polyfill Node.js built-ins" +
	"\n- Configure your bundler to load Workers-compatible builds by changing the main fields/conditions" +
	"\n- Find an alternative package that doesn't require Node.js built-ins";

// Module identifier used if script came from `script` option
export function buildStringScriptPath(workerIndex: number) {
	return `<script:${workerIndex}>`;
}
const stringScriptRegexp = /^<script:(\d+)>$/;
export function maybeGetStringScriptPathIndex(
	scriptPath: string
): number | undefined {
	const match = stringScriptRegexp.exec(scriptPath);
	return match === null ? undefined : parseInt(match[1]);
}

export const ModuleRuleTypeSchema = z.union([
	z.literal("ESModule"),
	z.literal("CommonJS"),
	z.literal("Text"),
	z.literal("Data"),
	z.literal("CompiledWasm"),
]);
export type ModuleRuleType = z.infer<typeof ModuleRuleTypeSchema>;

export const ModuleRuleSchema = z.object({
	type: ModuleRuleTypeSchema,
	include: z.string().array(),
	fallthrough: z.boolean().optional(),
});
export type ModuleRule = z.infer<typeof ModuleRuleSchema>;

// Manually defined module
export const ModuleDefinitionSchema = z.object({
	type: ModuleRuleTypeSchema,
	path: z.string(),
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
		modulesRoot: z.string().optional(),
	}),
	z.object({
		script: z.string(),
		// Optional script path for resolving modules, and stack traces file names
		scriptPath: z.string().optional(),
		// Automatically collect modules by parsing `script` if `true`, or treat as
		// service-worker if `false`
		modules: z.boolean().optional(),
		// How to interpret automatically collected modules
		modulesRules: z.array(ModuleRuleSchema).optional(),
		// `modules` "name"s will be their paths relative to this value.
		// This ensures file paths in stack traces are correct.
		modulesRoot: z.string().optional(),
	}),
	z.object({
		scriptPath: z.string(),
		// Automatically collect modules by parsing `scriptPath` if `true`, or treat
		// as service-worker if `false`
		modules: z.boolean().optional(),
		// How to interpret automatically collected modules
		modulesRules: z.array(ModuleRuleSchema).optional(),
		// `modules` "name"s will be their paths relative to this value.
		// This ensures file paths in stack traces are correct.
		modulesRoot: z.string().optional(),
	}),
]);
export type SourceOptions = z.infer<typeof SourceOptionsSchema>;

const DEFAULT_MODULE_RULES: ModuleRule[] = [
	{ type: "ESModule", include: ["**/*.mjs"] },
	{ type: "CommonJS", include: ["**/*.js", "**/*.cjs"] },
];

interface CompiledModuleRule {
	type: ModuleRuleType;
	include: MatcherRegExps;
}

function compileModuleRules(rules?: ModuleRule[]) {
	const compiledRules: CompiledModuleRule[] = [];
	const finalisedTypes = new Set<ModuleRuleType>();
	for (const rule of [...(rules ?? []), ...DEFAULT_MODULE_RULES]) {
		// Ignore rule if type didn't enable fallthrough
		if (finalisedTypes.has(rule.type)) continue;
		compiledRules.push({
			type: rule.type,
			include: globsToRegExps(rule.include),
		});
		if (!rule.fallthrough) finalisedTypes.add(rule.type);
	}
	return compiledRules;
}

function getResolveErrorPrefix(referencingPath: string): string {
	const relative = path.relative("", referencingPath);
	return `Unable to resolve "${relative}" dependency`;
}

export class ModuleLocator {
	readonly #compiledRules: CompiledModuleRule[];
	readonly #visitedPaths = new Set<string>();
	readonly modules: Worker_Module[] = [];

	constructor(
		private readonly sourceMapRegistry: SourceMapRegistry,
		private readonly modulesRoot: string,
		rules?: ModuleRule[]
	) {
		this.#compiledRules = compileModuleRules(rules);
	}

	visitEntrypoint(code: string, modulePath: string) {
		modulePath = path.resolve(modulePath);

		// If we've already visited this path, return
		if (this.#visitedPaths.has(modulePath)) return;
		this.#visitedPaths.add(modulePath);

		// Entrypoint is always an ES module
		this.#visitJavaScriptModule(code, modulePath);
	}

	#visitJavaScriptModule(code: string, modulePath: string, esModule = true) {
		// Register module
		const name = path.relative(this.modulesRoot, modulePath);
		code = this.sourceMapRegistry.register(code, modulePath);
		this.modules.push(
			esModule ? { name, esModule: code } : { name, commonJsModule: code }
		);

		// Parse code and visit all import/export statements
		let root;
		try {
			root = parse(code, {
				ecmaVersion: "latest",
				sourceType: esModule ? "module" : "script",
				locations: true,
			});
		} catch (e: any) {
			// TODO: fallback to error-tolerant parser?
			// Extract :<line>:<column> from error if included
			let loc = "";
			if (e.loc?.line !== undefined) {
				loc += `:${e.loc.line}`;
				if (e.loc.column !== undefined) loc += `:${e.loc.column}`;
			}
			throw new MiniflareCoreError(
				"ERR_MODULE_PARSE",
				`Unable to parse "${name}": ${
					e.message ?? e
				}\n    at ${modulePath}${loc}`
			);
		}
		// noinspection JSUnusedGlobalSymbols
		const visitors = {
			ImportDeclaration: (node: estree.ImportDeclaration) => {
				this.#visitModule(modulePath, node.source);
			},
			ExportNamedDeclaration: (node: estree.ExportNamedDeclaration) => {
				if (node.source != null) this.#visitModule(modulePath, node.source);
			},
			ExportAllDeclaration: (node: estree.ExportAllDeclaration) => {
				this.#visitModule(modulePath, node.source);
			},
			ImportExpression: (node: estree.ImportExpression) => {
				this.#visitModule(modulePath, node.source);
			},
			CallExpression: esModule
				? undefined
				: (node: estree.CallExpression) => {
						// TODO: check global?
						const argument = node.arguments[0];
						if (
							node.callee.type === "Identifier" &&
							node.callee.name === "require" &&
							argument !== undefined
						) {
							this.#visitModule(modulePath, argument);
						}
				  },
		};
		simple(root, visitors as Record<string, (node: any) => void>);
	}

	#visitModule(
		referencingPath: string,
		specExpression: estree.Expression | estree.SpreadElement
	) {
		if (maybeGetStringScriptPathIndex(referencingPath) !== undefined) {
			const prefix = getResolveErrorPrefix(referencingPath);
			throw new MiniflareCoreError(
				"ERR_MODULE_STRING_SCRIPT",
				`${prefix}: imports are unsupported in string \`script\` without defined \`scriptPath\``
			);
		}

		// Ensure spec is a static string literal, and resolve full module identifier
		if (
			specExpression.type !== "Literal" ||
			typeof specExpression.value !== "string"
		) {
			// Include manual configuration for existing modules in error message
			const modules = this.modules.map((mod) => {
				const def = convertWorkerModule(mod);
				return `      { type: "${def.type}", path: "${def.path}" }`;
			});
			const modulesConfig = `  new Miniflare({
    modules: [
${modules.join(",\n")}
    ]
  })`;

			const prefix = getResolveErrorPrefix(referencingPath);
			let message = `${prefix}: dynamic module specifiers are unsupported.
You must manually define your modules when constructing Miniflare:
${dim(modulesConfig)}`;

			// `!= null` used in place of `!== null && !== undefined`
			if (specExpression.loc != null) {
				const { line, column } = specExpression.loc.start;
				message += `\n    at ${referencingPath}:${line}:${column}`;
			}
			throw new MiniflareCoreError("ERR_MODULE_DYNAMIC_SPEC", message);
		}
		const spec = specExpression.value;

		// `node:` and `cloudflare:` imports don't need to be included explicitly
		if (spec.startsWith("node:") || spec.startsWith("cloudflare:")) {
			return;
		}

		const identifier = path.resolve(path.dirname(referencingPath), spec);
		// The runtime requires module identifiers to be relative paths
		const name = path.relative(this.modulesRoot, identifier);

		// If we've already visited this path, return to avoid unbounded recursion
		if (this.#visitedPaths.has(identifier)) return;
		this.#visitedPaths.add(identifier);

		// Find first matching module rule
		const rule = this.#compiledRules.find((rule) =>
			testRegExps(rule.include, identifier)
		);
		if (rule === undefined) {
			const prefix = getResolveErrorPrefix(referencingPath);
			const isBuiltin = builtinModules.includes(spec);
			const suggestion = isBuiltin ? SUGGEST_NODE : SUGGEST_BUNDLE;
			throw new MiniflareCoreError(
				"ERR_MODULE_RULE",
				`${prefix} \"${spec}\": no matching module rules.\n${suggestion}`
			);
		}

		// Register module
		const data = readFileSync(identifier);
		switch (rule.type) {
			case "ESModule":
				this.#visitJavaScriptModule(data.toString("utf8"), identifier);
				break;
			case "CommonJS":
				this.#visitJavaScriptModule(data.toString("utf8"), identifier, false);
				break;
			case "Text":
				this.modules.push({ name, text: data.toString("utf8") });
				break;
			case "Data":
				this.modules.push({ name, data });
				break;
			case "CompiledWasm":
				this.modules.push({ name, wasm: data });
				break;
			default:
				// `type` should've been validated against `ModuleRuleTypeSchema`
				assert.fail(`Unreachable: ${rule.type} modules are unsupported`);
		}
	}
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export function contentsToString(contents: string | Uint8Array): string {
	return typeof contents === "string" ? contents : decoder.decode(contents);
}
function contentsToArray(contents: string | Uint8Array): Uint8Array {
	return typeof contents === "string" ? encoder.encode(contents) : contents;
}
export function convertModuleDefinition(
	sourceMapRegistry: SourceMapRegistry,
	modulesRoot: string,
	def: ModuleDefinition
): Worker_Module {
	// The runtime requires module identifiers to be relative paths
	let name = path.relative(modulesRoot, def.path);
	if (path.sep === "\\") name = name.replaceAll("\\", "/");
	let contents = def.contents ?? readFileSync(def.path);
	switch (def.type) {
		case "ESModule":
			contents = contentsToString(contents);
			contents = sourceMapRegistry.register(contents, def.path);
			return { name, esModule: contents };
		case "CommonJS":
			contents = contentsToString(contents);
			contents = sourceMapRegistry.register(contents, def.path);
			return { name, commonJsModule: contents };
		case "Text":
			return { name, text: contentsToString(contents) };
		case "Data":
			return { name, data: contentsToArray(contents) };
		case "CompiledWasm":
			return { name, wasm: contentsToArray(contents) };
		default:
			// `type` should've been validated against `ModuleRuleTypeSchema`
			assert.fail(`Unreachable: ${def.type} modules are unsupported`);
	}
}
function convertWorkerModule(mod: Worker_Module): ModuleDefinition {
	const path = mod.name;
	assert(path !== undefined);

	if ("esModule" in mod) return { path, type: "ESModule" };
	else if ("commonJsModule" in mod) return { path, type: "CommonJS" };
	else if ("text" in mod) return { path, type: "Text" };
	else if ("data" in mod) return { path, type: "Data" };
	else if ("wasm" in mod) return { path, type: "CompiledWasm" };

	// This function is only used for building error messages including
	// generated modules, and these are the types we generate.
	assert.fail(
		`Unreachable: [${Object.keys(mod).join(", ")}] modules are unsupported`
	);
}
