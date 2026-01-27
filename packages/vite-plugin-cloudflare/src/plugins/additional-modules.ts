import assert from "node:assert";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import MagicString from "magic-string";
import * as vite from "vite";
import { cleanUrl, createPlugin } from "../utils";

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
			applyToEnvironment(environment) {
				return ctx.getWorkerConfig(environment.name) !== undefined;
			},
			resolveId: {
				async handler(source, importer, options) {
					const additionalModuleType = matchAdditionalModule(source);

					if (!additionalModuleType) {
						return;
					}

					// We clean the module URL here as the default rules include `.wasm?module`.
					// We therefore need the match to include the query param but remove it before resolving the ID.
					const resolved = await this.resolve(
						cleanUrl(source),
						importer,
						options
					);

					if (!resolved) {
						throw new Error(
							`Import "${source}" not found. Does the file exist?`
						);
					}

					// Add the path to the additional module so that we can identify the module in the `hotUpdate` hook
					additionalModulePaths.add(resolved.id);

					return {
						external: true,
						id: createModuleReference(additionalModuleType, resolved.id),
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
				async handler(code, chunk) {
					const matches = code.matchAll(additionalModuleGlobalRE);
					let magicString: MagicString | undefined;

					for (const match of matches) {
						magicString ??= new MagicString(code);
						const [full, _, modulePath] = match;

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
	}
);

const ADDITIONAL_MODULE_TYPES = ["CompiledWasm", "Data", "Text"] as const;
type AdditionalModuleType = (typeof ADDITIONAL_MODULE_TYPES)[number];

const ADDITIONAL_MODULE_PATTERN = `__CLOUDFLARE_MODULE__(${ADDITIONAL_MODULE_TYPES.join("|")})__(.*?)__CLOUDFLARE_MODULE__`;
export const additionalModuleRE = new RegExp(ADDITIONAL_MODULE_PATTERN);
const additionalModuleGlobalRE = new RegExp(ADDITIONAL_MODULE_PATTERN, "g");

type ModuleRules = Array<{
	type: AdditionalModuleType;
	extensions: string[];
}>;

const moduleRules: ModuleRules = [
	{ type: "CompiledWasm", extensions: [".wasm", ".wasm?module"] },
	{ type: "Data", extensions: [".bin"] },
	{ type: "Text", extensions: [".txt", ".html", ".sql"] },
];

function matchAdditionalModule(source: string) {
	for (const rule of moduleRules) {
		for (const extension of rule.extensions) {
			if (source.endsWith(extension)) {
				return rule.type;
			}
		}
	}

	return null;
}

function createModuleReference(type: AdditionalModuleType, id: string) {
	return `__CLOUDFLARE_MODULE__${type}__${id}__CLOUDFLARE_MODULE__`;
}
