import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { usesTypescript } from "../uses-typescript";
import { Framework } from "./framework-class";
import { readPackageJson } from "./utils/packages";
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
				transformViteConfig(projectPath);
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
 * configured. Used when a project that builds with Vite has no config file (e.g. projects
 * scaffolded with `npm create vite@latest --template vanilla`, or a Hono app).
 *
 * The file extension (`.ts` or `.js`) is chosen based on whether the project
 * has a `tsconfig.json`. On cf, outside an ES module package it is `.mts` or `.mjs`,
 * because Vite loads a `.ts` or `.js` config there as CommonJS, which can't import the
 * ESM-only Cloudflare plugin.
 *
 * @param projectPath The project's path
 * @param target The configuration target
 */
export function createViteConfig(
	projectPath: string,
	target: AutoConfigTarget
): void {
	const ext = usesTypescript(projectPath) ? "ts" : "js";
	const filePath = join(
		projectPath,
		target === "cf" && readPackageJson(projectPath)?.type !== "module"
			? `vite.config.m${ext}`
			: `vite.config.${ext}`
	);
	const content = `import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
\tplugins: [cloudflare()],
});
`;
	writeFileSync(filePath, content);
}
