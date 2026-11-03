import assert from "node:assert";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { DEFAULT_MODULE_RULES } from "@cloudflare/workers-utils";
import MagicString from "magic-string";
import { globsToRegExps } from "miniflare";
import * as vite from "vite";
import { cleanUrl, createPlugin } from "../utils";
import { readWasmSourceMap } from "../wasm-source-map";
import type { ModuleType } from "@cloudflare/config";

/**
 * Plugin to support additional module types (`CompiledWasm`, `Data` and `Text`)
 */
export const additionalModulesPlugin = createPlugin(
	"additional-modules",
	(ctx) => {
		const additionalModulePaths = new Set<string>();

		return {
			// We set `enforce: "pre"` so that this plugin runs before the Vite core plugins.
			// Otherwise the `vite:wasm-fallback` plugin prevents the `.wasm` extension being used for module imports.
			enforce: "pre",
			perEnvironmentStartEndDuringDev: true,
			applyToEnvironment(environment) {
				return ctx.getWorkerConfig(environment.name) !== undefined;
			},
			buildStart() {
				ctx.clearAdditionalModules(this.environment.name);
			},
			resolveId: {
				filter: { id: moduleRuleFilters },
				async handler(source, importer, options) {
					const resolved = await this.resolve(source, importer, options);

					if (!resolved) {
						return;
					}

					const additionalModuleType = matchAdditionalModule(resolved.id);

					if (!additionalModuleType) {
						return resolved;
					}

					// Strip query params from the resolved path
					const filePath = cleanUrl(resolved.id);

					// Add the path to the additional module so that we can identify the module in the `hotUpdate` hook
					additionalModulePaths.add(filePath);

					return {
						external: true,
						id: createModuleReference(additionalModuleType, filePath),
					};
				},
			},
			hotUpdate(options) {
				if (additionalModulePaths.has(options.file)) {
					void options.server.restart();
					return [];
				}
			},
			renderChunk: {
				filter: { code: { include: additionalModuleRE } },
				async handler(code, chunk) {
					const matches = code.matchAll(additionalModuleGlobalRE);
					let magicString: MagicString | undefined;

					for (const match of matches) {
						magicString ??= new MagicString(code);
						const [full, additionalModuleType, modulePath] = match;

						assert(
							isAdditionalModuleType(additionalModuleType),
							`Unexpected error: invalid additional module type in reference ${full}.`
						);

						assert(
							modulePath,
							`Unexpected error: module path not found in reference ${full}.`
						);

						let source: Buffer;

						try {
							source = await fsp.readFile(modulePath);
						} catch {
							throw new Error(
								`Import "${modulePath}" not found. Does the file exist?`
							);
						}

						const referenceId = this.emitFile({
							type: "asset",
							name: path.basename(modulePath),
							originalFileName: modulePath,
							source,
						});

						const emittedFileName = this.getFileName(referenceId);
						ctx.addAdditionalModule(
							this.environment.name,
							emittedFileName,
							toModuleType(additionalModuleType)
						);

						if (
							additionalModuleType === "CompiledWasm" &&
							this.environment.config.build.sourcemap
						) {
							await emitWasmSourceMap(
								this,
								modulePath,
								source,
								emittedFileName
							);
						}

						const relativePath = vite.normalizePath(
							path.relative(path.dirname(chunk.fileName), emittedFileName)
						);
						const importPath = relativePath.startsWith(".")
							? relativePath
							: `./${relativePath}`;

						magicString.update(
							match.index,
							match.index + full.length,
							importPath
						);
					}

					if (magicString) {
						return {
							code: magicString.toString(),
							map: this.environment.config.build.sourcemap
								? magicString.generateMap({ hires: "boundary" })
								: null,
						};
					}
				},
			},
		};

		/**
		 * Copies the source map named by a WebAssembly module's `sourceMappingURL`
		 * section next to the emitted module, so the section still finds it, and
		 * names the module in its `file` as it is uploaded. Warns if the map
		 * can't be copied.
		 */
		async function emitWasmSourceMap(
			pluginContext: vite.Rollup.PluginContext & {
				environment: vite.Environment;
			},
			modulePath: string,
			source: Buffer,
			emittedFileName: string
		): Promise<void> {
			let sourceMap: Awaited<ReturnType<typeof readWasmSourceMap>>;
			try {
				sourceMap = await readWasmSourceMap(
					modulePath,
					source,
					emittedFileName
				);
			} catch (error) {
				pluginContext.warn(
					`Skipping the source map of "${modulePath}": ${error instanceof Error ? error.message : String(error)}`
				);
				return;
			}
			if (sourceMap === undefined) {
				return;
			}

			const { environment } = pluginContext;
			const bundleDir = ctx.getWorkerBundleDir(environment.name);
			assert(
				bundleDir,
				`No Worker found for "${environment.name}" environment`
			);
			const moduleName = vite.normalizePath(
				path.relative(
					bundleDir,
					path.resolve(
						environment.config.root,
						environment.config.build.outDir,
						emittedFileName
					)
				)
			);
			pluginContext.emitFile({
				type: "asset",
				fileName: sourceMap.fileName,
				source: JSON.stringify({
					...sourceMap.sourceMap,
					file: `./${moduleName}`,
				}),
			});
		}
	}
);

const ADDITIONAL_MODULE_TYPES = ["CompiledWasm", "Data", "Text"] as const;
type AdditionalModuleType = (typeof ADDITIONAL_MODULE_TYPES)[number];

function isAdditionalModuleType(
	type: string | undefined
): type is AdditionalModuleType {
	return ADDITIONAL_MODULE_TYPES.some((moduleType) => moduleType === type);
}

function toModuleType(type: AdditionalModuleType): ModuleType {
	switch (type) {
		case "CompiledWasm":
			return "wasm";
		case "Data":
			return "data";
		case "Text":
			return "text";
	}
}

const ADDITIONAL_MODULE_PATTERN = `__CLOUDFLARE_MODULE__(${ADDITIONAL_MODULE_TYPES.join("|")})__(.*?)__CLOUDFLARE_MODULE__`;
export const additionalModuleRE = new RegExp(ADDITIONAL_MODULE_PATTERN);
const additionalModuleGlobalRE = new RegExp(ADDITIONAL_MODULE_PATTERN, "g");

type ModuleRules = Array<{
	type: AdditionalModuleType;
	pattern: RegExp;
}>;

// The default module rules, shared with Wrangler and the Vitest plugin
const moduleRules: ModuleRules = DEFAULT_MODULE_RULES.flatMap(
	({ type, globs }) =>
		isAdditionalModuleType(type)
			? globsToRegExps(globs, { endAnchor: true }).include.map((pattern) => ({
					type,
					pattern,
				}))
			: []
);

const subpathImportRE = /^#/;
const moduleRuleFilters = [
	...moduleRules.map((rule) => rule.pattern),
	subpathImportRE,
];

function matchAdditionalModule(source: string) {
	for (const rule of moduleRules) {
		if (rule.pattern.test(source)) {
			return rule.type;
		}
	}

	return null;
}

function createModuleReference(type: AdditionalModuleType, id: string) {
	return `__CLOUDFLARE_MODULE__${type}__${id}__CLOUDFLARE_MODULE__`;
}
