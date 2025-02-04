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

			if (!resolved) {
				return;
			}

			return {
				external: true,
				id: createModuleReference("CompiledWasm", resolved.id),
			};
		},
		renderChunk(code, chunk) {
			const moduleRE = new RegExp(MODULE_PATTERN, "g");
			let match: RegExpExecArray | null;
			let s: MagicString | undefined;

			while ((match = moduleRE.exec(code))) {
				s ||= new MagicString(code);
				const [full, _, id] = match;

				assert(
					id,
					`Unexpected error: module id not found in reference ${full}.`
				);

				let source: Buffer;

				try {
					source = fs.readFileSync(id);
				} catch (error) {
					throw new Error(`Import ${id} not found. Does the file exist?`);
				}

				const referenceId = this.emitFile({
					type: "asset",
					name: path.basename(id),
					originalFileName: id,
					source,
				});

				const emittedFileName = this.getFileName(referenceId);
				const relativePath = path.relative(
					path.dirname(chunk.fileName),
					emittedFileName
				);
				const importPath = relativePath.startsWith(".")
					? relativePath
					: `./${relativePath}`;

				s.update(match.index, match.index + full.length, importPath);
			}

			if (s) {
				return {
					code: s.toString(),
					map: this.environment.config.build.sourcemap
						? s.generateMap({ hires: "boundary" })
						: null,
				};
			}
		},
	};
}
