import { type NitroPreset } from "nitropack";

export default <NitroPreset>{
	extends: "cloudflare",
	exportConditions: ["workerd"],
	output: {
		dir: "{{ rootDir }}/dist",
		publicDir: "{{ output.dir }}/public",
		serverDir: "{{ output.dir }}/worker",
	},
	commands: {
		preview: "npx wrangler dev",
		deploy: "npx wrangler deploy",
	},
	wasm: {
		lazy: false,
		esmImport: true,
	},
	rollupConfig: {
		output: {
			entryFileNames: "index.js",
			format: "esm",
			exports: "named",
			inlineDynamicImports: false,
		},
	},
};
