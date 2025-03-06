import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TemplateConfig } from "../../src/templates";

export default {
	configVersion: 1,
	id: "hello-world",
	displayName: "Worker only",
	description: "Get started with a basic Worker in the language of your choice",
	platform: "workers",
	async configure(ctx) {
		if (ctx.args.lang === "python") {
			for (const file of ["pyproject.toml", "uv.lock"]) {
				const contents = await readFile(
					resolve(ctx.project.path, file),
					"utf8",
				);
				const updated = contents.replaceAll(/<TBD>/g, ctx.project.name);
				await writeFile(resolve(ctx.project.path, file), updated);
			}
		}
	},
	copyFiles: {
		variants: {
			js: {
				path: "./js",
			},
			ts: {
				path: "./ts",
			},
			python: {
				path: "./py",
			},
		},
	},
} satisfies TemplateConfig;
