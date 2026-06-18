import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { usesTypescript } from "../uses-typescript";
import { Framework } from "./framework-class";
import {
	checkIfViteConfigUsesCloudflarePlugin,
	hasViteConfig,
	transformViteConfig,
} from "./utils/vite-config";
import { installCloudflareVitePlugin } from "./utils/vite-plugin";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

export class Vite extends Framework {
	isConfigured(projectPath: string): boolean {
		if (!hasViteConfig(projectPath)) {
			return false;
		}
		return checkIfViteConfigUsesCloudflarePlugin(projectPath);
	}

	async configure({
		dryRun,
		projectPath,
		packageManager,
		isWorkspaceRoot,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			await installCloudflareVitePlugin({
				packageManager: packageManager.type,
				isWorkspaceRoot,
				projectPath,
			});

			if (hasViteConfig(projectPath)) {
				transformViteConfig(projectPath);
			} else {
				createViteConfig(projectPath);
			}
		}

		return {
			wranglerConfig: {
				assets: {
					not_found_handling: "single-page-application",
				},
			},
		};
	}
}

/**
 * Creates a minimal `vite.config` file with the Cloudflare plugin already
 * configured. Used when a Vite project has no config file (e.g. projects
 * scaffolded with `npm create vite@latest --template vanilla`).
 *
 * The file extension (`.ts` or `.js`) is chosen based on whether the project
 * has a `tsconfig.json`.
 */
function createViteConfig(projectPath: string): void {
	const ext = usesTypescript(projectPath) ? "ts" : "js";
	const filePath = join(projectPath, `vite.config.${ext}`);
	const content = `import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
\tplugins: [cloudflare()],
});
`;
	writeFileSync(filePath, content);
}
