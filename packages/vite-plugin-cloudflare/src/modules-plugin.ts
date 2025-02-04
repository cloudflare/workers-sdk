import * as vite from "vite";

export function modulesPlugin(): vite.Plugin {
	return {
		name: "vite-plugin-cloudflare:modules",
		enforce: "pre",
		async resolveId(source, importer) {
			if (!source.endsWith(".wasm")) {
				return;
			}

			const resolved = await this.resolve(source, importer);

			if (!resolved) {
				return;
			}

			return { external: "absolute", id: resolved.id };
		},
	};
}
