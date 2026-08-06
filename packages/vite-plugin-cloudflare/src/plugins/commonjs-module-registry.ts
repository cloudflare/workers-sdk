import * as path from "node:path";
import {
	experimental_classifyJavaScriptFile,
	experimental_createCommonJsGraph,
} from "@cloudflare/workers-utils";
import MagicString from "magic-string";
import * as vite from "vite";
import { cleanUrl, createPlugin, isRolldown } from "../utils";
import type { PluginContext } from "../context";
import type {
	ExperimentalCommonJsGraph,
	ExperimentalCommonJsGraphBuilder,
	ExperimentalCommonJsGraphModule,
} from "@cloudflare/workers-utils";

const moduleReferencePrefix = "__CLOUDFLARE_CJS_MODULE__";
const virtualWrapperPrefix = "\0cloudflare-commonjs-wrapper:";

interface EnvironmentState {
	builder?: ExperimentalCommonJsGraphBuilder;
	modules: Map<string, ExperimentalCommonJsGraphModule>;
	roots: Map<string, Promise<ExperimentalCommonJsGraph>>;
	wrappers: Map<string, Promise<ExperimentalCommonJsGraph>>;
}

const states = new WeakMap<PluginContext, Map<string, EnvironmentState>>();

function createEnvironmentState(): EnvironmentState {
	return {
		modules: new Map(),
		roots: new Map(),
		wrappers: new Map(),
	};
}

function getEnvironmentState(
	ctx: PluginContext,
	environmentName: string
): EnvironmentState {
	let environmentStates = states.get(ctx);
	if (environmentStates === undefined) {
		environmentStates = new Map();
		states.set(ctx, environmentStates);
	}
	let state = environmentStates.get(environmentName);
	if (state === undefined) {
		state = createEnvironmentState();
		environmentStates.set(environmentName, state);
	}
	return state;
}

function resetEnvironmentState(
	ctx: PluginContext,
	environmentName: string
): EnvironmentState {
	const environmentStates = states.get(ctx) ?? new Map();
	states.set(ctx, environmentStates);
	const state = createEnvironmentState();
	environmentStates.set(environmentName, state);
	return state;
}

function isBareModuleSpecifier(specifier: string): boolean {
	return (
		!specifier.startsWith(".") &&
		!specifier.startsWith("/") &&
		!specifier.startsWith("\\") &&
		!path.isAbsolute(specifier)
	);
}

function isInNodeModules(filePath: string): boolean {
	return cleanUrl(filePath).split(/[\\/]/).includes("node_modules");
}

function createModuleReference(
	environmentName: string,
	emittedName: string
): string {
	return `${moduleReferencePrefix}/${encodeURIComponent(environmentName)}/${emittedName}`;
}

function parseModuleReference(specifier: string):
	| {
			environmentName: string;
			emittedName: string;
	  }
	| undefined {
	let pathname = specifier;
	try {
		pathname = new URL(specifier).pathname;
	} catch {}
	const marker = `${moduleReferencePrefix}/`;
	const markerIndex = pathname.indexOf(marker);
	if (markerIndex === -1) {
		return;
	}
	const reference = pathname.slice(markerIndex + marker.length);
	const separatorIndex = reference.indexOf("/");
	if (separatorIndex === -1) {
		return;
	}
	return {
		environmentName: decodeURIComponent(reference.slice(0, separatorIndex)),
		emittedName: decodeURIComponent(reference.slice(separatorIndex + 1)),
	};
}

export function getExperimentalCommonJsModuleName(
	specifier: string
): string | undefined {
	return parseModuleReference(specifier)?.emittedName;
}

export function isExperimentalCommonJsModuleReference(
	specifier: string
): boolean {
	return parseModuleReference(specifier) !== undefined;
}

export function getExperimentalCommonJsModule(
	ctx: PluginContext,
	specifier: string
): ExperimentalCommonJsGraphModule | undefined {
	const reference = parseModuleReference(specifier);
	if (reference === undefined) {
		return;
	}
	return states
		.get(ctx)
		?.get(reference.environmentName)
		?.modules.get(reference.emittedName);
}

export function getExperimentalCommonJsModuleTypes(
	ctx: PluginContext,
	environmentName: string
): ReadonlyMap<string, ExperimentalCommonJsGraphModule["sourceType"]> {
	return new Map(
		[...getEnvironmentState(ctx, environmentName).modules].map(
			([name, module]) => [name, module.sourceType]
		)
	);
}

function createInteropWrapper(
	graph: ExperimentalCommonJsGraph,
	environmentName: string
): string {
	let binding = "__commonJsModule";
	while (graph.root.namedExports.includes(binding)) {
		binding = `_${binding}`;
	}

	return [
		`import ${binding} from ${JSON.stringify(createModuleReference(environmentName, graph.root.emittedName))};`,
		`export default ${binding};`,
		...graph.root.namedExports.map(
			(name) => `export const ${name} = ${binding}.${name};`
		),
	].join("\n");
}

/** Preserve npm CommonJS boundaries for workerd's experimental module registry. */
export const commonJsModuleRegistryPlugin = createPlugin(
	"commonjs-module-registry",
	(ctx) => ({
		enforce: "pre",
		applyToEnvironment(environment) {
			return ctx
				.getWorkerConfig(environment.name)
				?.compatibility_flags?.includes("new_module_registry");
		},
		configResolved(config) {
			for (const [environmentName, environment] of Object.entries(
				config.environments
			)) {
				if (
					ctx
						.getWorkerConfig(environmentName)
						?.compatibility_flags?.includes("new_module_registry")
				) {
					environment.optimizeDeps.noDiscovery = true;
					environment.optimizeDeps.include = [];
				}
			}
		},
		buildStart() {
			resetEnvironmentState(ctx, this.environment.name);
		},
		async resolveId(source, importer, options) {
			if (isExperimentalCommonJsModuleReference(source)) {
				return { id: source, external: true };
			}
			if (source.startsWith(virtualWrapperPrefix)) {
				return source;
			}

			const resolved = await this.resolve(source, importer, {
				...options,
				skipSelf: true,
			});
			if (resolved === null || resolved.external) {
				return;
			}
			const resolvedPath = cleanUrl(resolved.id);
			if (
				!path.isAbsolute(resolvedPath) ||
				![".js", ".cjs"].includes(path.extname(resolvedPath)) ||
				(!isBareModuleSpecifier(source) &&
					!isInNodeModules(importer ?? "") &&
					!isInNodeModules(resolvedPath)) ||
				(await experimental_classifyJavaScriptFile(resolvedPath)) !== "commonjs"
			) {
				return;
			}

			const state = getEnvironmentState(ctx, this.environment.name);
			const requireResolver =
				isRolldown && this.environment.mode === "build"
					? undefined
					: this.environment.config.createResolver({ isRequire: true });
			state.builder ??= experimental_createCommonJsGraph({
				resolve: async (specifier, graphImporter) => {
					if (requireResolver !== undefined) {
						return requireResolver(specifier, graphImporter);
					}
					const dependency = await this.resolve(specifier, graphImporter, {
						kind: "require-call",
						skipSelf: true,
					});
					if (dependency === null || dependency.external) {
						return;
					}
					const dependencyPath = cleanUrl(dependency.id);
					return path.isAbsolute(dependencyPath) ? dependencyPath : undefined;
				},
			});
			let graphPromise = state.roots.get(resolvedPath);
			if (graphPromise === undefined) {
				graphPromise = state.builder.discover(resolvedPath);
				state.roots.set(resolvedPath, graphPromise);
			}
			const graph = await graphPromise;
			for (const module of graph.modules) {
				state.modules.set(module.emittedName, module);
				this.addWatchFile(module.sourcePath);
			}

			const wrapperId = `${virtualWrapperPrefix}${resolvedPath}`;
			state.wrappers.set(wrapperId, graphPromise);
			return {
				id: wrapperId,
				moduleSideEffects: resolved.moduleSideEffects,
			};
		},
		async load(id) {
			const graph = getEnvironmentState(
				ctx,
				this.environment.name
			).wrappers.get(id);
			return graph === undefined
				? undefined
				: createInteropWrapper(await graph, this.environment.name);
		},
		hotUpdate(options) {
			const state = getEnvironmentState(ctx, this.environment.name);
			if (
				[...state.modules.values()].some(
					(module) => module.sourcePath === options.file
				)
			) {
				void options.server.restart();
				return [];
			}
		},
		renderChunk(code, chunk) {
			const referencePattern = new RegExp(
				`${moduleReferencePrefix}/[^/"'\\n\\r]+/([^"'\\n\\r]+)`,
				"g"
			);
			let magicString: MagicString | undefined;
			for (const match of code.matchAll(referencePattern)) {
				const [reference, emittedName] = match;
				if (emittedName === undefined) {
					continue;
				}
				magicString ??= new MagicString(code);
				const relativePath = vite.normalizePath(
					path.relative(path.dirname(chunk.fileName), emittedName)
				);
				magicString.update(
					match.index,
					match.index + reference.length,
					relativePath.startsWith(".") ? relativePath : `./${relativePath}`
				);
			}
			if (magicString !== undefined) {
				return {
					code: magicString.toString(),
					map: this.environment.config.build.sourcemap
						? magicString.generateMap({ hires: "boundary" })
						: null,
				};
			}
		},
		generateBundle() {
			for (const module of getEnvironmentState(
				ctx,
				this.environment.name
			).modules.values()) {
				this.emitFile({
					type: "asset",
					fileName: module.emittedName,
					originalFileName: module.sourcePath,
					source: module.transformedSource,
				});
			}
		},
	})
);
