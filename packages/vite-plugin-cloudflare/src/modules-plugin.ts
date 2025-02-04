import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import MagicString from "magic-string";
import * as vite from "vite";

const moduleTypes = ["CompiledWasm"] as const;
type ModuleType = (typeof moduleTypes)[number];

const moduleRE = new RegExp(
	`__CLOUDFLARE_MODULE__${moduleTypes.join("|")}__(.*?)__`,
	"g"
);

function createModuleReference(type: ModuleType, id: string) {
	return `__CLOUDFLARE_MODULE__${type}__${id}__`;
}

export function modulesPlugin(): vite.Plugin {
	return {
		name: "vite-plugin-cloudflare:modules",
		enforce: "pre",
		applyToEnvironment(environment) {
			// TODO: apply only to Worker environments
			return true;
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
			const replacementMap = new Map<string, string>();
			let match: RegExpExecArray | null;
			let s: MagicString | undefined;

			moduleRE.lastIndex = 0;
			while ((match = moduleRE.exec(code))) {
				s ||= new MagicString(code);
				const [full, id] = match;

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

				const emittedFileName = `./${this.getFileName(referenceId)}`;

				s.update(match.index, match.index + full.length, emittedFileName);
				replacementMap.set(full, emittedFileName);
			}

			if (s) {
				chunk.imports = chunk.imports.map((id) => replacementMap.get(id) ?? id);
				chunk.importedBindings = Object.fromEntries(
					Object.entries(chunk.importedBindings).map(([id, bindings]) => [
						replacementMap.get(id) ?? id,
						bindings,
					])
				);

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
