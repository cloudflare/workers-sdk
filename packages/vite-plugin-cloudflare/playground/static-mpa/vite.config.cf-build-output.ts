import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	environments: {
		client: {
			build: {
				rollupOptions: {
					input: {
						main: path.resolve(import.meta.dirname, "index.html"),
						contact: path.resolve(import.meta.dirname, "contact.html"),
						"404": path.resolve(import.meta.dirname, "404.html"),
						about: path.resolve(import.meta.dirname, "about/index.html"),
						"about-404": path.resolve(import.meta.dirname, "about/404.html"),
					},
				},
			},
		},
	},
	plugins: [
		cloudflare({
			inspectorPort: false,
			persistState: false,
			experimental: {
				newConfig: {
					cfBuildOutput: true,
					types: { generate: false },
				},
			},
		}),
	],
});
