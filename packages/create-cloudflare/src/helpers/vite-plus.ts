import { join } from "node:path";
import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import { readJSON } from "./files";
import { detectPackageManager } from "./packageManagers";
import type { C3Context } from "types";

export async function formatVitePlusProject(ctx: C3Context): Promise<void> {
	const pkg = readJSON(join(ctx.project.path, "package.json")) as {
		devDependencies?: Record<string, string>;
	};
	if (!pkg.devDependencies?.["vite-plus"]) {
		return;
	}
	const { npx } = detectPackageManager();
	await runCommand([npx, "vp", "fmt"], {
		cwd: ctx.project.path,
		silent: true,
		startText: "Formatting the generated project",
		doneText: "Project formatted",
	});
}
