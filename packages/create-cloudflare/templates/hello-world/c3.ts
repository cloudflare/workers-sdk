import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TemplateConfig } from "../../src/templates";

export default {
	configVersion: 1,
	id: "hello-world",
	displayName: "Worker only",
	description:
		"For processing requests, transforming responses, or API endpoints",
	platform: "workers",
	async configure(ctx) {
		if (ctx.args.lang === "python") {
			const contents = await readFile(
				resolve(ctx.project.path, "pyproject.toml"),
				"utf8",
			);
			const updated = contents.replaceAll(/<TBD>/g, ctx.project.name);
			await writeFile(resolve(ctx.project.path, "pyproject.toml"), updated);
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
