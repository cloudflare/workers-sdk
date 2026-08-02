import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import path from "node:path";
import { Parser } from "acorn";
import * as cjsModuleLexer from "cjs-module-lexer";

export type ExperimentalJavaScriptSourceType = "commonjs" | "esmodule";

export interface ExperimentalCommonJsGraphModule {
	/** The absolute source file used by the caller's resolver. */
	sourcePath: string;
	/** The safe, registry-relative name to use when emitting this module. */
	emittedName: string;
	/** Source with local requires rewritten to other emitted module names. */
	transformedSource: string;
	/** The module type the caller should use when emitting this source. */
	sourceType: ExperimentalJavaScriptSourceType;
	/** Safe binding identifiers detected for a generated ESM interop wrapper. */
	namedExports: string[];
}

export interface ExperimentalCommonJsGraph {
	root: ExperimentalCommonJsGraphModule;
	modules: ExperimentalCommonJsGraphModule[];
}

export type ExperimentalCommonJsResolver = (
	specifier: string,
	importer: string
) => Promise<string | undefined>;

export interface ExperimentalCommonJsGraphOptions {
	/** Resolve with the integration's own CommonJS conditions. */
	resolve: ExperimentalCommonJsResolver;
}

interface AstNode {
	type: string;
	start: number;
	end: number;
	loc?: { start: { line: number; column: number } };
	[key: string]: unknown;
}

interface RequireCall {
	argument: AstNode;
	specifier: string;
}

interface Scope {
	parent?: Scope;
	kind: "block" | "function";
	bindings: Set<string>;
}

interface PackageInfo {
	name: string;
	root: string;
}

interface ModuleRecord {
	module?: ExperimentalCommonJsGraphModule;
	dependencies: string[];
	dependenciesBySpecifier: Map<string, string>;
	reexports: string[];
	directNamedExports: string[];
	complete: Promise<void>;
}

const REGISTRY_ROOT = "__cloudflare_cjs__";
let lexerInit: Promise<void> | undefined;

function isNotFoundError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}

async function readPackageJson(
	directory: string
): Promise<Record<string, unknown> | undefined> {
	try {
		return JSON.parse(
			await readFile(path.join(directory, "package.json"), "utf8")
		) as Record<string, unknown>;
	} catch (error) {
		if (isNotFoundError(error)) {
			return undefined;
		}
		throw error;
	}
}

function parentDirectories(filePath: string): string[] {
	const directories: string[] = [];
	let directory = path.dirname(filePath);
	while (true) {
		directories.push(directory);
		const parent = path.dirname(directory);
		if (parent === directory) {
			return directories;
		}
		directory = parent;
	}
}

/**
 * Classifies a resolved JavaScript file using Node's package type semantics.
 */
export async function experimental_classifyJavaScriptFile(
	filePath: string
): Promise<ExperimentalJavaScriptSourceType> {
	const extension = path.extname(filePath);
	if (extension === ".cjs") {
		return "commonjs";
	}
	if (extension === ".mjs") {
		return "esmodule";
	}
	if (extension !== ".js") {
		throw new Error(
			`Cannot classify ${JSON.stringify(filePath)} as JavaScript: expected a .js, .cjs, or .mjs file.`
		);
	}

	for (const directory of parentDirectories(filePath)) {
		const packageJson = await readPackageJson(directory);
		if (packageJson !== undefined) {
			return packageJson.type === "module" ? "esmodule" : "commonjs";
		}
	}
	return "commonjs";
}

function isAstNode(value: unknown): value is AstNode {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		typeof (value as { type?: unknown }).type === "string"
	);
}

function forEachChild(node: AstNode, callback: (child: AstNode) => void): void {
	for (const [key, value] of Object.entries(node)) {
		if (key === "loc") {
			continue;
		}
		if (isAstNode(value)) {
			callback(value);
		} else if (Array.isArray(value)) {
			for (const item of value) {
				if (isAstNode(item)) {
					callback(item);
				}
			}
		}
	}
}

function addPatternBindings(pattern: AstNode | undefined, scope: Scope): void {
	if (pattern === undefined) {
		return;
	}
	if (pattern.type === "Identifier") {
		scope.bindings.add(pattern.name as string);
		return;
	}
	if (pattern.type === "Property") {
		addPatternBindings(pattern.value as AstNode, scope);
		return;
	}
	if (pattern.type === "RestElement") {
		addPatternBindings(pattern.argument as AstNode, scope);
		return;
	}
	if (pattern.type === "AssignmentPattern") {
		addPatternBindings(pattern.left as AstNode, scope);
		return;
	}
	if (pattern.type === "ArrayPattern" || pattern.type === "ObjectPattern") {
		forEachChild(pattern, (child) => addPatternBindings(child, scope));
	}
}

function nearestFunctionScope(scope: Scope): Scope {
	while (scope.kind !== "function") {
		scope = scope.parent as Scope;
	}
	return scope;
}

function buildScopeMap(root: AstNode): Map<AstNode, Scope> {
	const scopes = new Map<AstNode, Scope>();
	const rootScope: Scope = { kind: "function", bindings: new Set() };

	function visit(node: AstNode, scope: Scope): void {
		scopes.set(node, scope);

		if (
			node.type === "FunctionDeclaration" ||
			node.type === "FunctionExpression" ||
			node.type === "ArrowFunctionExpression"
		) {
			const id = node.id as AstNode | undefined;
			if (node.type === "FunctionDeclaration" && id?.type === "Identifier") {
				scope.bindings.add(id.name as string);
			}
			const functionScope: Scope = {
				parent: scope,
				kind: "function",
				bindings: new Set(),
			};
			if (node.type === "FunctionExpression" && id?.type === "Identifier") {
				functionScope.bindings.add(id.name as string);
			}
			for (const parameter of node.params as AstNode[]) {
				addPatternBindings(parameter, functionScope);
				visit(parameter, functionScope);
			}
			visit(node.body as AstNode, functionScope);
			return;
		}

		if (node.type === "BlockStatement") {
			const blockScope: Scope = {
				parent: scope,
				kind: "block",
				bindings: new Set(),
			};
			scopes.set(node, blockScope);
			for (const statement of node.body as AstNode[]) {
				visit(statement, blockScope);
			}
			return;
		}

		if (node.type === "CatchClause") {
			const catchScope: Scope = {
				parent: scope,
				kind: "block",
				bindings: new Set(),
			};
			scopes.set(node, catchScope);
			const parameter = node.param as AstNode | undefined;
			addPatternBindings(parameter, catchScope);
			if (parameter !== undefined) {
				visit(parameter, catchScope);
			}
			visit(node.body as AstNode, catchScope);
			return;
		}

		if (node.type === "VariableDeclaration") {
			const bindingScope =
				node.kind === "var" ? nearestFunctionScope(scope) : scope;
			for (const declaration of node.declarations as AstNode[]) {
				addPatternBindings(declaration.id as AstNode, bindingScope);
				visit(declaration, scope);
			}
			return;
		}

		if (
			(node.type === "ClassDeclaration" || node.type === "ImportDeclaration") &&
			isAstNode(node.id)
		) {
			addPatternBindings(node.id, scope);
		}

		forEachChild(node, (child) => visit(child, scope));
	}

	visit(root, rootScope);
	return scopes;
}

function isRequireShadowed(scope: Scope): boolean {
	for (
		let current: Scope | undefined = scope;
		current;
		current = current.parent
	) {
		if (current.bindings.has("require")) {
			return true;
		}
	}
	return false;
}

function findRequireCalls(sourcePath: string, source: string): RequireCall[] {
	const root = Parser.parse(source, {
		ecmaVersion: "latest",
		sourceType: "script",
		allowHashBang: true,
		allowReturnOutsideFunction: true,
		locations: true,
	}) as unknown as AstNode;
	const scopes = buildScopeMap(root);
	const calls: RequireCall[] = [];

	function visit(node: AstNode): void {
		if (node.type === "CallExpression") {
			const callee = node.callee as AstNode;
			if (
				callee.type === "Identifier" &&
				callee.name === "require" &&
				!isRequireShadowed(scopes.get(node) as Scope)
			) {
				const args = node.arguments as AstNode[];
				const argument = args[0];
				if (
					args.length !== 1 ||
					argument?.type !== "Literal" ||
					typeof argument.value !== "string"
				) {
					const location = node.loc?.start;
					const suffix = location
						? `:${location.line}:${location.column + 1}`
						: "";
					throw new Error(
						`Experimental CommonJS graph cannot analyze dynamic require() in ${sourcePath}${suffix}; only require() with one string literal is supported.`
					);
				}
				calls.push({
					argument,
					specifier: argument.value,
				});
			}
		}
		forEachChild(node, visit);
	}

	visit(root);
	return calls;
}

function isSafeBindingIdentifier(name: string): boolean {
	if (name === "default" || name === "__esModule") {
		return false;
	}
	try {
		const root = Parser.parse(`export const ${name} = 0`, {
			ecmaVersion: "latest",
			sourceType: "module",
		}) as unknown as AstNode;
		const body = root.body as AstNode[];
		const declaration = body[0]?.declaration as AstNode | undefined;
		const declarators = declaration?.declarations as AstNode[] | undefined;
		const identifier = declarators?.[0]?.id as AstNode | undefined;
		return (
			body.length === 1 &&
			declaration?.type === "VariableDeclaration" &&
			declarators?.length === 1 &&
			identifier?.type === "Identifier" &&
			identifier.name === name
		);
	} catch {
		return false;
	}
}

async function parseNamedExports(source: string): Promise<{
	exports: string[];
	reexports: string[];
}> {
	lexerInit ??= cjsModuleLexer.init();
	await lexerInit;
	const result = cjsModuleLexer.parse(source);
	return {
		exports: result.exports.filter(isSafeBindingIdentifier),
		reexports: result.reexports,
	};
}

function toPosixPath(filePath: string): string {
	return filePath.replaceAll(path.sep, path.posix.sep);
}

function validatePackageName(name: string): string[] {
	const parts = name.split("/");
	const valid = name.startsWith("@")
		? parts.length === 2 && parts[0].length > 1 && parts[1].length > 0
		: parts.length === 1 && parts[0].length > 0;
	if (
		!valid ||
		parts.some(
			(part) =>
				part === "." || part === ".." || !/^@?[a-zA-Z0-9._~-]+$/.test(part)
		)
	) {
		throw new Error(
			`Cannot emit experimental CommonJS package with unsafe name ${JSON.stringify(name)}.`
		);
	}
	return parts;
}

async function findPackageInfo(filePath: string): Promise<PackageInfo> {
	for (const directory of parentDirectories(filePath)) {
		const packageJson = await readPackageJson(directory);
		if (typeof packageJson?.name === "string") {
			validatePackageName(packageJson.name);
			return { name: packageJson.name, root: directory };
		}
	}
	throw new Error(
		`Cannot emit ${JSON.stringify(filePath)} in the experimental CommonJS registry because it is not inside a named npm package.`
	);
}

function emittedNameFor(filePath: string, packageInfo: PackageInfo): string {
	const relativePath = path.relative(packageInfo.root, filePath);
	if (
		relativePath === ".." ||
		relativePath.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relativePath)
	) {
		throw new Error(`CommonJS module escaped package root: ${filePath}`);
	}
	const instance = createHash("sha256")
		.update(toPosixPath(path.resolve(packageInfo.root)))
		.digest("hex")
		.slice(0, 10);
	return path.posix.join(
		REGISTRY_ROOT,
		instance,
		...validatePackageName(packageInfo.name),
		toPosixPath(relativePath)
	);
}

function rewriteRequires(
	source: string,
	replacements: Array<{ argument: AstNode; emittedSpecifier: string }>
): string {
	for (const replacement of replacements.sort(
		(a, b) => b.argument.start - a.argument.start
	)) {
		source =
			source.slice(0, replacement.argument.start) +
			JSON.stringify(replacement.emittedSpecifier) +
			source.slice(replacement.argument.end);
	}
	return source;
}

/**
 * A reusable graph builder. Reusing one instance caches modules by resolved path
 * across roots while retaining the resolver's integration-specific conditions.
 */
export class ExperimentalCommonJsGraphBuilder {
	readonly #resolve: ExperimentalCommonJsResolver;
	readonly #records = new Map<string, ModuleRecord>();

	constructor(options: ExperimentalCommonJsGraphOptions) {
		this.#resolve = options.resolve;
	}

	async discover(rootPath: string): Promise<ExperimentalCommonJsGraph> {
		rootPath = path.resolve(rootPath);
		const root = await this.#visit(rootPath, new Set());
		if (root.sourceType !== "commonjs") {
			throw new Error(
				`Experimental CommonJS graph root ${JSON.stringify(rootPath)} is an ES module.`
			);
		}

		const modules: ExperimentalCommonJsGraphModule[] = [];
		const seen = new Set<string>();
		const collect = (sourcePath: string) => {
			if (seen.has(sourcePath)) {
				return;
			}
			seen.add(sourcePath);
			const record = this.#records.get(sourcePath) as ModuleRecord;
			modules.push(record.module as ExperimentalCommonJsGraphModule);
			for (const dependency of record.dependencies) {
				collect(dependency);
			}
		};
		collect(rootPath);

		for (const module of modules) {
			module.namedExports = [
				...this.#collectNamedExports(module.sourcePath, new Set()),
			].sort();
		}
		modules.sort((a, b) => a.emittedName.localeCompare(b.emittedName));
		return { root, modules };
	}

	async #visit(
		sourcePath: string,
		ancestors: Set<string>
	): Promise<ExperimentalCommonJsGraphModule> {
		const existing = this.#records.get(sourcePath);
		if (existing !== undefined) {
			if (!ancestors.has(sourcePath)) {
				await existing.complete;
			}
			return existing.module as ExperimentalCommonJsGraphModule;
		}

		const {
			promise: complete,
			resolve: resolveComplete,
			reject: rejectComplete,
		} = Promise.withResolvers<void>();
		void complete.catch(() => {});
		const record: ModuleRecord = {
			dependencies: [],
			dependenciesBySpecifier: new Map(),
			reexports: [],
			directNamedExports: [],
			complete,
		};
		this.#records.set(sourcePath, record);

		try {
			await this.#buildRecord(record, sourcePath, ancestors);
			resolveComplete();
		} catch (error) {
			this.#records.delete(sourcePath);
			rejectComplete(error);
			throw error;
		}
		return record.module as ExperimentalCommonJsGraphModule;
	}

	async #buildRecord(
		record: ModuleRecord,
		sourcePath: string,
		ancestors: Set<string>
	): Promise<void> {
		const packageInfo = await findPackageInfo(sourcePath);
		const emittedName = emittedNameFor(sourcePath, packageInfo);
		const extension = path.extname(sourcePath);
		const originalSource = await readFile(sourcePath, "utf8");

		if (extension === ".json") {
			JSON.parse(originalSource);
			record.module = {
				sourcePath,
				emittedName,
				transformedSource: `module.exports = JSON.parse(${JSON.stringify(originalSource)});\n`,
				sourceType: "commonjs",
				namedExports: [],
			};
			return;
		}

		const sourceType = await experimental_classifyJavaScriptFile(sourcePath);
		record.module = {
			sourcePath,
			emittedName,
			transformedSource: originalSource,
			sourceType,
			namedExports: [],
		};
		if (sourceType === "esmodule") {
			return;
		}

		const calls = findRequireCalls(sourcePath, originalSource);
		const namedExports = await parseNamedExports(originalSource);
		record.directNamedExports = namedExports.exports;
		record.reexports = namedExports.reexports;
		const nextAncestors = new Set(ancestors).add(sourcePath);
		const replacements: Array<{
			argument: AstNode;
			emittedSpecifier: string;
		}> = [];

		for (const call of calls) {
			if (isBuiltin(call.specifier)) {
				continue;
			}
			const resolved = await this.#resolve(call.specifier, sourcePath);
			if (resolved === undefined) {
				throw new Error(
					`Experimental CommonJS graph could not resolve ${JSON.stringify(call.specifier)} from ${JSON.stringify(sourcePath)}.`
				);
			}
			const dependencyPath = path.resolve(resolved);
			const dependency = await this.#visit(dependencyPath, nextAncestors);
			record.dependencies.push(dependencyPath);
			record.dependenciesBySpecifier.set(call.specifier, dependencyPath);
			const relativeName = path.posix.relative(
				path.posix.dirname(emittedName),
				dependency.emittedName
			);
			replacements.push({
				argument: call.argument,
				emittedSpecifier: relativeName.startsWith(".")
					? relativeName
					: `./${relativeName}`,
			});
		}
		record.module.transformedSource = rewriteRequires(
			originalSource,
			replacements
		);
	}

	#collectNamedExports(sourcePath: string, seen: Set<string>): Set<string> {
		if (seen.has(sourcePath)) {
			return new Set();
		}
		seen.add(sourcePath);
		const record = this.#records.get(sourcePath) as ModuleRecord;
		const names = new Set(record.directNamedExports);
		for (const reexport of record.reexports) {
			const dependencyPath = record.dependenciesBySpecifier.get(reexport);
			if (dependencyPath !== undefined) {
				for (const name of this.#collectNamedExports(dependencyPath, seen)) {
					names.add(name);
				}
			}
		}
		return names;
	}
}

export function experimental_createCommonJsGraph(
	options: ExperimentalCommonJsGraphOptions
): ExperimentalCommonJsGraphBuilder {
	return new ExperimentalCommonJsGraphBuilder(options);
}
