import assert from "node:assert";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { updateStatus } from "@cloudflare/cli-shared-helpers";
import { blue, brandColor } from "@cloudflare/cli-shared-helpers/colors";
import { installPackages } from "@cloudflare/cli-shared-helpers/packages";
import { transformFile } from "@cloudflare/codemod";
import * as recast from "recast";
import dedent from "ts-dedent";
import { Framework } from "./framework-class";
import { installCloudflareVitePlugin } from "./utils/vite-plugin";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";
import type { types } from "recast";

const b = recast.types.builders;
const t = recast.types.namedTypes;

export class Waku extends Framework {
	async configure({
		dryRun,
		projectPath,
		packageManager,
		isWorkspaceRoot,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			await installPackages(packageManager.type, ["hono"], {
				dev: true,
				startText: "Installing hono dependency",
				doneText: `${brandColor("installed")}`,
				isWorkspaceRoot,
			});

			await installCloudflareVitePlugin({
				packageManager: packageManager.type,
				projectPath,
				isWorkspaceRoot,
			});

			await createWakuServerFile(projectPath);
			await updateWakuConfig(projectPath);
		}

		return {
			wranglerConfig: {
				main: "./src/waku.server",
				assets: {
					binding: "ASSETS",
					directory: "./dist/public",
					html_handling: "drop-trailing-slash",
				},
			},
		};
	}
}

/**
 * Created a waku.server.tsx file that uses the Cloudflare adapter
 *
 * @param projectPath Path to the project
 */
async function createWakuServerFile(projectPath: string) {
	await writeFile(
		`${projectPath}/src/waku.server.tsx`,
		dedent`
			import { fsRouter } from 'waku';
			import adapter from 'waku/adapters/cloudflare';

			export default adapter(
				fsRouter(import.meta.glob('./**/*.{tsx,ts}', { base: './pages' })),
				{
					handlers: {
					// Define additional Cloudflare Workers handlers here
					// https://developers.cloudflare.com/workers/runtime-apis/handlers/
					// async queue(
					//   batch: MessageBatch,
					//   _env: Env,
					//   _ctx: ExecutionContext,
					// ): Promise<void> {
					//   for (const message of batch.messages) {
					//     console.log('Received', message);
					//   }
					// },
					},
				},
			);
			`
	);
}

/**
 * Updated the waku.config.ts file to import and use the Cloudflare Vite plugin
 *
 * @param projectPath Path to the project
 */
async function updateWakuConfig(projectPath: string) {
	const wakuConfigPath = join(projectPath, "waku.config.ts");

	if (!existsSync(wakuConfigPath)) {
		throw new Error("Could not find Waku config file to modify");
	}

	updateStatus(`Updating Waku configuration in ${blue(wakuConfigPath)}`);

	transformFile(wakuConfigPath, {
		visitProgram(n) {
			// Add an import of the @cloudflare/vite-plugin
			// ```
			// import { cloudflare } from '@cloudflare/vite-plugin';
			// ```
			const lastImportIndex = n.node.body.findLastIndex(
				(statement) => statement.type === "ImportDeclaration"
			);
			const lastImport = n.get("body", lastImportIndex);

			// Only import if not already imported
			if (
				!n.node.body.some(
					(s) =>
						s.type === "ImportDeclaration" &&
						s.source.value === "@cloudflare/vite-plugin"
				)
			) {
				const importAst = b.importDeclaration(
					[b.importSpecifier(b.identifier("cloudflare"))],
					b.stringLiteral("@cloudflare/vite-plugin")
				);
				lastImport.insertAfter(importAst);
			}

			return this.traverse(n);
		},
		visitCallExpression: function (n) {
			const callee = n.node.callee as types.namedTypes.Identifier;
			if (callee.name !== "defineConfig") {
				return this.traverse(n);
			}

			const config = n.node.arguments[0];
			assert(t.ObjectExpression.check(config));
			const viteConfig = config.properties.find((prop) =>
				isViteProp(prop)
			)?.value;
			assert(t.ObjectExpression.check(viteConfig));
			const pluginsProp = viteConfig.properties.find((prop) =>
				isPluginsProp(prop)
			);
			assert(pluginsProp && t.ArrayExpression.check(pluginsProp.value));

			// Only add the Cloudflare loader plugin if it's not already present
			if (
				!pluginsProp.value.elements.some(
					(el) =>
						el?.type === "CallExpression" &&
						el.callee.type === "Identifier" &&
						el.callee.name === "cloudflare"
				)
			) {
				pluginsProp.value.elements.push(
					b.callExpression(b.identifier("cloudflare"), [
						b.objectExpression([
							b.objectProperty(
								b.identifier("viteEnvironment"),
								b.objectExpression([
									b.objectProperty(
										b.identifier("name"),
										b.stringLiteral("rsc")
									),
									b.objectProperty(
										b.identifier("childEnvironments"),
										b.arrayExpression([b.stringLiteral("ssr")])
									),
								])
							),
							b.objectProperty(
								b.identifier("inspectorPort"),
								b.booleanLiteral(false)
							),
						]),
					])
				);
			}

			this.traverse(n);
		},
	});
}

function isViteProp(
	prop: unknown
): prop is types.namedTypes.ObjectProperty | types.namedTypes.Property {
	return (
		(t.Property.check(prop) || t.ObjectProperty.check(prop)) &&
		t.Identifier.check(prop.key) &&
		prop.key.name === "vite"
	);
}

function isPluginsProp(
	prop: unknown
): prop is types.namedTypes.ObjectProperty | types.namedTypes.Property {
	return (
		(t.Property.check(prop) || t.ObjectProperty.check(prop)) &&
		t.Identifier.check(prop.key) &&
		prop.key.name === "plugins"
	);
}
