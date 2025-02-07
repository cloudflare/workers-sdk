import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import MagicString from "magic-string";
import * as vite from "vite";
import { MODULE_PATTERN } from "./shared";
import type { ResolvedPluginConfigContainer } from ".";
import type { ModuleType } from "./constants";

function createModuleReference(type: ModuleType, id: string) {
	return `__CLOUDFLARE_MODULE__${type}__${id}__`;
}

export function modulesPlugin(
	resolvedPluginConfigContainer: ResolvedPluginConfigContainer
): vite.Plugin {
	return {
		name: "vite-plugin-cloudflare:modules",
		// We set `enforce: "pre"` so that this plugin runs before the Vite core plugins.
		// Otherwise the `.wasm` extension cannot be used for module imports
		enforce: "pre",
		applyToEnvironment(environment) {
			if (
				resolvedPluginConfigContainer.resolvedPluginConfig.type ===
				"assets-only"
			) {
				return false;
			}

			return Object.keys(
				resolvedPluginConfigContainer.resolvedPluginConfig.workers
			).includes(environment.name);
		},
		async resolveId(source, importer) {
			if (!source.endsWith(".wasm")) {
				return;
			}

			const resolved = await this.resolve(source, importer);
			assert(
				resolved,
				`Unexpected error: could not resolve Wasm module ${source}`
			);

			return {
				external: true,
				id: createModuleReference("CompiledWasm", resolved.id),
			};
		},
		renderChunk(code, chunk) {
			const moduleRE = new RegExp(MODULE_PATTERN, "g");
			let match: RegExpExecArray | null;
			let magicString: MagicString | undefined;

			while ((match = moduleRE.exec(code))) {
				magicString ||= new MagicString(code);
				const [full, moduleType, modulePath] = match;

				assert(
					modulePath,
					`Unexpected error: module path not found in reference ${full}.`
				);

				let source: Buffer;

				try {
					source = fs.readFileSync(modulePath);
				} catch (error) {
					throw new Error(
						`Import ${modulePath} not found. Does the file exist?`
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

				magicString.update(match.index, match.index + full.length, importPath);
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
	};
}
