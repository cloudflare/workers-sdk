import { writeFile } from "node:fs/promises";
import { endSection } from "@cloudflare/cli";
import { brandColor } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import * as recast from "recast";
import * as typescriptParser from "recast/parsers/typescript";
import { transformFile } from "../c3-vendor/codemod";
import { quoteShellArgs, runCommand } from "../c3-vendor/command";
import { usesTypescript } from "../uses-typescript";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";
import type { Program } from "esprima";

export class Qwik extends Framework {
	async configure({
		projectPath,
		dryRun,
		packageManager,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			// Add the pages integration
			const cmd = [
				// For some reason `pnpx qwik add` fails for qwik so we use `pnpm qwik add` instead.
				packageManager.type === "pnpm"
					? packageManager.type
					: packageManager.npx,
				"qwik",
				"add",
				"cloudflare-pages",
			];
			endSection(`Running ${quoteShellArgs(cmd)}`);
			await runCommand(cmd);

			addBindingsProxy(projectPath);

			await addAssetsIgnoreFile(projectPath);
		}
		return {
			wranglerConfig: {
				main: "./dist/_worker.js",
				compatibility_flags: ["global_fetch_strictly_public"],
				assets: {
					binding: "ASSET",
					directory: "./dist",
				},
			},
			packageJsonScriptsOverrides: {
				preview: `${packageManager.type} run build && wrangler dev`,
				deploy: `${packageManager.type} run build && wrangler deploy`,
			},
		};
	}

	configurationDescription =
		'Configuring project for Qwik with "qwik add cloudflare-pages"';
}

function addBindingsProxy(projectPath: string) {
	// Qwik only has a typescript template atm.
	// This check is an extra precaution
	if (!usesTypescript(projectPath)) {
		return;
	}

	const s = spinner();
	s.start("Updating `vite.config.ts`");

	const b = recast.types.builders;

	const getPlatformProxyTsAstNodes = (
		recast.parse(
			`
				let platform = {};

				if (process.env.NODE_ENV === 'development') {
					const { getPlatformProxy } = await import('wrangler');
					platform = await getPlatformProxy();
				}
			`,
			{ parser: typescriptParser }
		).program as Program
	).body;

	transformFile("vite.config.ts", {
		// Insert the env declaration after the last import (but before the rest of the body)
		visitProgram: function (n) {
			const lastImportIndex = n.node.body.findLastIndex(
				(t) => t.type === "ImportDeclaration"
			);
			const lastImport = n.get("body", lastImportIndex);
			lastImport.insertAfter(...getPlatformProxyTsAstNodes);

			return this.traverse(n);
		},
		// Pass the `platform` object from the declaration to the `qwikCity` plugin
		visitCallExpression: function (n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name !== "qwikCity") {
				return this.traverse(n);
			}

			// The config object passed to `qwikCity`
			const configArgument = n.node.arguments[0] as
				| recast.types.namedTypes.ObjectExpression
				| undefined;

			const platformPropery = b.objectProperty.from({
				key: b.identifier("platform"),
				value: b.identifier("platform"),
				shorthand: true,
			});

			if (!configArgument) {
				n.node.arguments = [b.objectExpression([platformPropery])];

				return false;
			}

			if (configArgument.type !== "ObjectExpression") {
				throw new Error("Failed to update `vite.config.ts`");
			}

			// Add the `platform` object to the object
			configArgument.properties.push(platformPropery);

			return false;
		},
	});

	s.stop(`${brandColor("updated")} \`vite.config.ts\``);
}

async function addAssetsIgnoreFile(projectPath: string) {
	const toAdd = ["_worker.js", "_routes.json", "_headers", "_redirects"];

	await writeFile(
		`${projectPath}/public/.assetsignore`,
		`${toAdd.join("\n")}\n`
	);
}
