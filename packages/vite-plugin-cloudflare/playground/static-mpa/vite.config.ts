import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	environments: {
		client: {
			build: {
				rollupOptions: {
					input: {
						main: path.resolve(__dirname, "index.html"),
						contact: path.resolve(__dirname, "contact.html"),
						"404": path.resolve(__dirname, "404.html"),
						about: path.resolve(__dirname, "about/index.html"),
						"about-404": path.resolve(__dirname, "about/404.html"),
					},
				},
			},
		},
	},
	plugins: [cloudflare({ persistState: false })],
});
