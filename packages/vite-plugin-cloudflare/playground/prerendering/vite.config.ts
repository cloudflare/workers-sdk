import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig, preview } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			inspectorPort: false,
			persistState: false,
			experimental: {
				prerenderWorker: {
					config(_, { entryWorkerConfig }) {
						return {
							...entryWorkerConfig,
							name: "prerender",
							main: "./src/prerender.ts",
						};
					},
				},
			},
		}),
		{
			name: "prerender-plugin",
			enforce: "post",
			buildApp: {
				order: "post",
				async handler(builder) {
					const previewServer = await preview({
						// Needed because the tests are run from a different directory
						root: path.dirname(fileURLToPath(import.meta.url)),
						logLevel: "silent",
						preview: {
							port: 0,
						},
					});

					const baseUrl = previewServer.resolvedUrls?.local[0];
					const clientOutputDirectory =
						builder.environments.client?.config.build.outDir;

					if (baseUrl && clientOutputDirectory) {
						const response = await fetch(new URL("/prerendered", baseUrl));
						const html = await response.text();

						await fsp.writeFile(
							path.resolve(
								builder.config.root,
								clientOutputDirectory,
								"prerendered.html"
							),
							html
						);

						console.log("Pre-rendered /prerendered");
					}

					await previewServer.close();
				},
			},
		},
	],
});
