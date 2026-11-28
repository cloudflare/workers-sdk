import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { usesTypescript } from "../uses-typescript";
import { Framework } from "./framework-class";
import {
	assertViteConfigCanBeTransformed,
	checkIfViteConfigUsesCloudflarePlugin,
	hasViteConfig,
	transformViteConfig,
} from "./utils/vite-config";
import { installCloudflareVitePlugin } from "./utils/vite-plugin";
import { CF_VITE_PLUGIN_VERSION_RANGE } from "./utils/vite-plugin-version";
import type { AutoConfigTarget } from "../context";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

export class Vite extends Framework {
	override readonly supportsMode = true;

	readonly env = {
		CLOUDFLARE_VITE_FORCE_BUILD_OUTPUT: "true",
	} as const;

	isConfigured(
		projectPath: string,
		{ target = "cf" }: { target?: AutoConfigTarget } = {}
	): boolean {
		if (target !== "wrangler") {
			return false;
		}
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
		target,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (hasViteConfig(projectPath)) {
			assertViteConfigCanBeTransformed(projectPath);
		}
		if (!dryRun) {
			await installCloudflareVitePlugin({
				packageManager: packageManager.type,
				isWorkspaceRoot,
				projectPath,
				version: target === "cf" ? CF_VITE_PLUGIN_VERSION_RANGE : undefined,
			});

			if (hasViteConfig(projectPath)) {
				transformViteConfig(projectPath, { target });
			} else {
				createViteConfig(projectPath, target);
			}
		}

		return {
			buildTool: "vite",
			workerConfig: {
				assets: {
					notFoundHandling: "single-page-application",
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
 * Use an explicit ESM extension for cf so the config can load the ESM-only
 * plugin without changing the project's package.json module type.
 */
function createViteConfig(projectPath: string, target: AutoConfigTarget): void {
	const ext =
		target === "cf" ? "mts" : usesTypescript(projectPath) ? "ts" : "js";
	const filePath = join(projectPath, `vite.config.${ext}`);
	const content = `import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
\tplugins: [cloudflare()],
});
`;
	writeFileSync(filePath, content);
}
