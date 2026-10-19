import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import playgroundPackage from "../playground/package.json";
import type { TestProject } from "vitest/node";

declare module "vitest" {
	export interface ProvidedContext {
		rsbuildPluginTarball: string;
	}
}

/**
 * Packs `@cloudflare/rsbuild-plugin` for the fixtures to install. It's private,
 * so it can't be published to the mock npm registry. Its dependencies are the
 * Vite plugin's, which the registry does publish.
 */
export default async function ({ provide }: TestProject) {
	const packDir = await fs.mkdtemp(
		path.join(await fs.realpath(os.tmpdir()), "rsbuild-plugin-")
	);
	const output = execFileSync(
		"pnpm",
		["pack", "--json", "--pack-destination", packDir],
		{
			cwd: path.resolve(__dirname, "../../rsbuild-plugin-cloudflare"),
			encoding: "utf8",
			shell: process.platform === "win32",
		}
	);
	provide("rsbuildPluginTarball", JSON.parse(output).filename);
	return () => removeDir(packDir);
}

/**
 * Turns a seeded Vite fixture into the equivalent Rsbuild project: the
 * `cloudflare()` options are passed unchanged to `pluginCloudflare()`, and the
 * `vite` scripts become `rsbuild` ones.
 *
 * @param projectPath The seeded project
 * @param tarball The packed `@cloudflare/rsbuild-plugin`
 */
export async function convertToRsbuild(projectPath: string, tarball: string) {
	const pkgPath = path.join(projectPath, "package.json");
	const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
	const { devDependencies: versions } = playgroundPackage;
	for (const deps of [pkg.dependencies, pkg.devDependencies]) {
		if (deps?.["@cloudflare/vite-plugin"]) {
			delete deps["@cloudflare/vite-plugin"];
			delete deps.vite;
			deps["@cloudflare/rsbuild-plugin"] = `file:${tarball}`;
			deps["@rsbuild/core"] = versions["@rsbuild/core"];
		}
		if (deps?.["@vitejs/plugin-react"]) {
			delete deps["@vitejs/plugin-react"];
			deps["@rsbuild/plugin-react"] = versions["@rsbuild/plugin-react"];
		}
	}
	for (const [name, script] of Object.entries<string>(pkg.scripts)) {
		pkg.scripts[name] = script.replace(
			/\bvite(?: (dev|build|preview))?\b/g,
			(_, command = "dev") => `rsbuild ${command}`
		);
	}
	await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));

	const files = await fs.readdir(projectPath);
	const viteConfigFile = files.find((file) =>
		/^vite\.config\.m?[jt]s$/.test(file)
	);
	if (!viteConfigFile) {
		throw new Error(`No Vite config found in ${projectPath}.`);
	}
	let config = await fs.readFile(
		path.join(projectPath, viteConfigFile),
		"utf8"
	);
	for (const [from, to] of [
		[
			`import { cloudflare } from "@cloudflare/vite-plugin";`,
			`import { pluginCloudflare as cloudflare } from "@cloudflare/rsbuild-plugin";`,
		],
		[
			`import react from "@vitejs/plugin-react";`,
			`import { pluginReact as react } from "@rsbuild/plugin-react";`,
		],
		[
			`import { defineConfig } from "vite";`,
			`import { defineConfig } from "@rsbuild/core";`,
		],
	]) {
		config = config.replace(from, to);
	}
	if (/from "(vite|@vitejs\/.*|@cloudflare\/vite-plugin)"/.test(config)) {
		throw new Error(
			`${viteConfigFile} has imports with no Rsbuild equivalent.`
		);
	}

	// Vite uses `index.html` as the client entry, whereas Rsbuild injects the
	// page's script into the HTML. Vite also resolves root-relative imports
	// (e.g. `/vite.svg`) from `public/`.
	const htmlPath = path.join(projectPath, "index.html");
	const scriptRE = /\s*<script type="module" src="\/([^"]+)"><\/script>/;
	const html = files.includes("index.html")
		? await fs.readFile(htmlPath, "utf8")
		: "";
	const script = html.match(scriptRE)?.[1];
	if (script) {
		await fs.writeFile(htmlPath, html.replace(scriptRE, ""));
		config = config.replace(
			"defineConfig({",
			[
				"defineConfig({",
				`source: { entry: { index: "./${script}" } },`,
				`html: { template: "./index.html" },`,
				"tools: { rspack: { resolve: { roots: [`${import.meta.dirname}/public`] } } },",
			].join("\n\t")
		);
	}
	await fs.writeFile(
		path.join(projectPath, viteConfigFile.replace("vite", "rsbuild")),
		config
	);
	await fs.rm(path.join(projectPath, viteConfigFile));
}
