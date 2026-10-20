import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Emit declarations from a checked-in project before tsdown reads its inputs.
 * Register the compiler's source files so watch builds also refresh declarations.
 *
 * @param {string} [project] Declaration project relative to the package root.
 */
export function emitDeclarations(project = "tsconfig.declarations.json") {
	/** @type {string[]} */
	let files = [];
	let dirty = false;
	function emit() {
		const result = spawnSync(
			process.execPath,
			[
				fileURLToPath(
					new URL("bin/tsrs", import.meta.resolve("tsrs/package.json"))
				),
				"--project",
				project,
				"--listFiles",
			],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
		);
		if (result.error) throw result.error;
		if (result.status !== 0)
			throw new Error(
				result.stdout || `tsrs exited with status ${result.status}`
			);
		return result.stdout
			.split(/\r?\n/)
			.filter((file) => isAbsolute(file) && !file.includes("/node_modules/"));
	}
	return {
		name: "emit-declarations",
		tsdownConfig() {
			files = emit();
		},
		/** @this {{ addWatchFile: (file: string) => void }} */
		buildStart() {
			if (dirty) {
				files = emit();
				dirty = false;
			}
			for (const file of files) this.addWatchFile(file);
			this.addWatchFile(project);
		},
		load: {
			filter: { id: /\/emitted-types\/.*\.d\.[cm]?ts$/ },
			/** @param {string} id */
			handler(id) {
				// Chain tsrs's declaration maps so bundled maps point to TypeScript sources.
				if (!existsSync(`${id}.map`)) return;
				return {
					code: readFileSync(id, "utf8"),
					map: readFileSync(`${id}.map`, "utf8"),
				};
			},
		},
		/** @param {string} id */
		watchChange(id) {
			dirty ||= files.includes(id) || id === resolve(project);
		},
	};
}
