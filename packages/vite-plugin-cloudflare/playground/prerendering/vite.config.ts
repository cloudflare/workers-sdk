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

					const prerenderOutputDirectory =
						builder.environments.prerender?.config.build.outDir;

					if (prerenderOutputDirectory) {
						await fsp.rm(
							path.resolve(builder.config.root, prerenderOutputDirectory),
							{
								recursive: true,
								force: true,
							}
						);
					}
				},
			},
		},
	],
});
