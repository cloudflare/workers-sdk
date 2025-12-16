import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TemplateConfig } from "../../src/templates";

export default {
	configVersion: 1,
	id: "hello-world-workflows",
	displayName: "Workflow",
	description:
		"For multi-step applications that automatically retry, persist state, and run for minutes, hours, days or weeks",
	platform: "workers",
	async configure(ctx) {
		const file = "wrangler.jsonc";
		if (ctx.args.lang && ["js", "ts"].includes(ctx.args.lang)) {
			const contents = await readFile(resolve(ctx.project.path, file), "utf8");
			const updated = contents.replace(
				/<WORKFLOW_NAME>/g,
				`workflow-${ctx.project.name}`,
			);
			await writeFile(resolve(ctx.project.path, file), updated);
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
		},
	},
} satisfies TemplateConfig;
