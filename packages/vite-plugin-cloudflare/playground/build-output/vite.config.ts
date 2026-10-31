import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export function createConfig(sourcemap: boolean | undefined) {
	return {
		environments: {
			ssr: {
				build: {
					rollupOptions: {
						output: {
							entryFileNames: "chunks/[name]-[hash].mjs",
						},
					},
					sourcemap,
				},
			},
		},
		plugins: [
			cloudflare({
				inspectorPort: false,
				persistState: false,
				types: { includeRuntime: false },
			}),
		],
	};
}

export default defineConfig(createConfig(undefined));
