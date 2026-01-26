import assert from "node:assert";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { updateStatus } from "@cloudflare/cli";
import { blue, brandColor } from "@cloudflare/cli/colors";
import * as recast from "recast";
import dedent from "ts-dedent";
import { transformFile } from "../c3-vendor/codemod";
import { installPackages } from "../c3-vendor/packages";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";
import type { types } from "recast";

const b = recast.types.builders;
const t = recast.types.namedTypes;

export class Waku extends Framework {
	async configure({
		dryRun,
		projectPath,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			await installPackages(["hono", "@hiogawa/node-loader-cloudflare"], {
				dev: true,
				startText: "Installing additional dependencies",
				doneText: `${brandColor("installed")}`,
			});

			await createCloudflareMiddleware(projectPath);
			await createWakuServerFile(projectPath);
			await updateWakuConfig(projectPath);
		}

		return {
			wranglerConfig: {
				main: "./dist/server/serve-cloudflare.js",
				compatibility_flags: ["nodejs_compat"],
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
 * Created the middleware/cloudflare.ts file
 *
 * @param projectPath The path for the project
 */
async function createCloudflareMiddleware(projectPath: string) {
	const middlewareDir = `${projectPath}/src/middleware`;

	await mkdir(middlewareDir, { recursive: true });

	await writeFile(
		`${middlewareDir}/cloudflare.ts`,
		dedent`
					import type { Context, MiddlewareHandler } from 'hono';

					function isWranglerDev(c: Context): boolean {
						// This header seems to only be set for production cloudflare workers
						return !c.req.header('cf-visitor');
					}

					const cloudflareMiddleware = (): MiddlewareHandler => {
						return async (c, next) => {
							await next();
							if (!import.meta.env?.PROD) {
								return;
							}
							if (!isWranglerDev(c)) {
								return;
							}
							const contentType = c.res.headers.get('content-type');
							if (
								!contentType ||
								contentType.includes('text/html') ||
								contentType.includes('text/plain')
							) {
								const headers = new Headers(c.res.headers);
								headers.set('content-encoding', 'Identity');
								c.res = new Response(c.res.body, {
									status: c.res.status,
									statusText: c.res.statusText,
									headers: c.res.headers,
								});
							}
						};
					};

					export default cloudflareMiddleware;
				`
	);
}

/**
 * Updated the waku.config.ts file to import and use the @hiogawa/node-loader-cloudflare plugin
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
			// Add an import of the @hiogawa/node-loader-cloudflare/vite
			// ```
			// import nodeLoaderCloudflare from '@hiogawa/node-loader-cloudflare/vite;
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
						s.source.value === "@hiogawa/node-loader-cloudflare/vite"
				)
			) {
				const importAst = b.importDeclaration(
					[b.importDefaultSpecifier(b.identifier("nodeLoaderCloudflare"))],
					b.stringLiteral("@hiogawa/node-loader-cloudflare/vite")
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
						el.callee.name === "nodeLoaderCloudflare"
				)
			) {
				pluginsProp.value.elements.push(
					b.callExpression(b.identifier("nodeLoaderCloudflare"), [
						b.objectExpression([
							b.objectProperty(
								b.identifier("environments"),
								b.arrayExpression([b.stringLiteral("rsc")])
							),
							b.objectProperty(b.identifier("build"), b.booleanLiteral(true)),
							b.objectProperty(
								b.identifier("getPlatformProxyOptions"),
								b.objectExpression([
									b.objectProperty(
										b.identifier("persist"),
										b.objectExpression([
											b.objectProperty(
												b.identifier("path"),
												b.stringLiteral(".wrangler/state/v3")
											),
										])
									),
								])
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
