import assert from "node:assert";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { brandColor, dim } from "@cloudflare/cli/colors";
import * as recast from "recast";
import semiver from "semiver";
import dedent from "ts-dedent";
import { logger } from "../../logger";
import { transformFile } from "../c3-vendor/codemod";
import { installPackages } from "../c3-vendor/packages";
import { getInstalledPackageVersion } from "./utils/packages";
import { transformViteConfig } from "./utils/vite-config";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

const b = recast.types.builders;

function transformReactRouterConfig(
	projectPath: string,
	viteEnvironmentKey: ReturnType<typeof configPropertyName>
) {
	const filePathTS = path.join(projectPath, `react-router.config.ts`);
	const filePathJS = path.join(projectPath, `react-router.config.js`);

	let filePath: string;

	if (existsSync(filePathTS)) {
		filePath = filePathTS;
	} else if (existsSync(filePathJS)) {
		filePath = filePathJS;
	} else {
		throw new Error("Could not find React Router config file to modify");
	}

	transformFile(filePath, {
		/**
		 * Visit an export default declaration of the form:
		 *
		 *   export default {
		 *     ...
		 *   }
		 *
		 * and add or modify the `future` property to look like:
		 *
		 *   future: {
		 *     unstable_viteEnvironmentApi: true // v8_viteEnvironment depending on the React Router version
		 *   }
		 *
		 * For some extra complexity, this also supports TS `as` and `satisfies` expressions
		 */
		visitExportDefaultDeclaration(n) {
			let node: recast.types.namedTypes.ObjectExpression;
			if (
				(n.node.declaration.type === "TSAsExpression" ||
					n.node.declaration.type === "TSSatisfiesExpression") &&
				n.node.declaration.expression.type === "ObjectExpression"
			) {
				node = n.node.declaration.expression;
			} else if (n.node.declaration.type === "ObjectExpression") {
				node = n.node.declaration;
			} else {
				throw new Error(
					`Could not parse React Router config file. Please add the following snippet manually:\n  future: {\n    ${viteEnvironmentKey}: true,\n  }`
				);
			}

			assert(node.type === "ObjectExpression");

			// Is there an existing `future` key? If there is, we should modify it rather than creating a new one
			const futureKey = node.properties.findIndex(
				(p) =>
					p.type === "ObjectProperty" &&
					p.key.type === "Identifier" &&
					p.key.name === "future" &&
					p.value.type === "ObjectExpression"
			);
			if (futureKey !== -1) {
				const future = node.properties[futureKey];
				assert(
					future.type === "ObjectProperty" &&
						future.value.type === "ObjectExpression"
				);

				// Does the `future` key already have a property called `unstable_viteEnvironmentApi`?
				const viteEnvironment = future.value.properties.findIndex(
					(p) =>
						p.type === "ObjectProperty" &&
						p.key.type === "Identifier" &&
						p.key.name === viteEnvironmentKey &&
						p.value.type === "BooleanLiteral"
				);

				// If there's already a unstable_viteEnvironmentApi key, set the value to true
				if (viteEnvironment !== -1) {
					const prop = future.value.properties[viteEnvironment];
					assert(
						prop.type === "ObjectProperty" &&
							prop.value.type === "BooleanLiteral"
					);
					prop.value.value = true;
				} else {
					const prop = b.objectProperty(
						b.identifier(viteEnvironmentKey),
						b.booleanLiteral(true)
					);
					future.value.properties.push(prop);
				}
			} else {
				node.properties.push(
					b.objectProperty(
						b.identifier("future"),
						b.objectExpression([
							b.objectProperty(
								b.identifier(viteEnvironmentKey),
								b.booleanLiteral(true)
							),
						])
					)
				);
			}

			return false;
		},
	});
}

function configPropertyName(projectPath: string) {
	const reactRouterVersion = getInstalledPackageVersion(
		"react-router",
		projectPath
	);

	if (!reactRouterVersion) {
		return "v8_viteEnvironmentApi";
	}

	// version less than 7.10.0
	if (semiver(reactRouterVersion, "7.10.0") === -1) {
		return "unstable_viteEnvironmentApi";
	} else {
		return "v8_viteEnvironmentApi";
	}
}

export class ReactRouter extends Framework {
	async configure({
		dryRun,
		projectPath,
		packageManager,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		const viteEnvironmentKey = configPropertyName(projectPath);
		if (!dryRun) {
			await installPackages(packageManager, ["@cloudflare/vite-plugin"], {
				dev: true,
				startText: "Installing the Cloudflare Vite plugin",
				doneText: `${brandColor(`installed`)} ${dim("@cloudflare/vite-plugin")}`,
			});

			mkdirSync("workers");

			writeFileSync(
				"workers/app.ts",
				dedent/* javascript */ `
					import { createRequestHandler } from "react-router";

					declare module "react-router" {
						export interface AppLoadContext {
							cloudflare: {
								env: Env;
								ctx: ExecutionContext;
							};
						}
					}

					const requestHandler = createRequestHandler(
						() => import("virtual:react-router/server-build"),
						import.meta.env.MODE
					);

					export default {
						async fetch(request, env, ctx) {
							return requestHandler(request, {
								cloudflare: { env, ctx },
							});
						},
					} satisfies ExportedHandler<Env>;
				`
			);

			await installPackages(packageManager, ["isbot"], {
				dev: true,
				startText: "Installing the isbot package",
				doneText: `${brandColor(`installed`)} ${dim("isbot")}`,
			});

			if (!existsSync("app/entry.server.tsx")) {
				writeFileSync(
					`app/entry.server.tsx`,
					dedent/* javascript */ `
					import type { AppLoadContext, EntryContext } from "react-router";
					import { ServerRouter } from "react-router";
					import { isbot } from "isbot";
					import { renderToReadableStream } from "react-dom/server";

					export default async function handleRequest(
						request: Request,
						responseStatusCode: number,
						responseHeaders: Headers,
						routerContext: EntryContext,
						_loadContext: AppLoadContext
					) {
						let shellRendered = false;
						const userAgent = request.headers.get("user-agent");

						const body = await renderToReadableStream(
							<ServerRouter context={routerContext} url={request.url} />,
							{
								onError(error: unknown) {
									responseStatusCode = 500;
									// Log streaming rendering errors from inside the shell.  Don't log
									// errors encountered during initial shell rendering since they'll
									// reject and get logged in handleDocumentRequest.
									if (shellRendered) {
										console.error(error);
									}
								},
							}
						);
						shellRendered = true;

						// Ensure requests from bots and SPA Mode renders wait for all content to load before responding
						// https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
						if ((userAgent && isbot(userAgent)) || routerContext.isSpaMode) {
							await body.allReady;
						}

						responseHeaders.set("Content-Type", "text/html");
						return new Response(body, {
							headers: responseHeaders,
							status: responseStatusCode,
						});
					}
				`
				);
			} else {
				logger.warn(
					"The file `app/entry.server.tsx` already exists on disk, and so we're not modifying it. This may lead to deployment failures if `app/entry.server.tsx` is not set up correctly."
				);
			}

			transformViteConfig(projectPath, {
				viteEnvironmentName: "ssr",
				incompatibleVitePlugins: ["netlifyReactRouter"],
			});

			transformReactRouterConfig(projectPath, viteEnvironmentKey);
		}

		return {
			wranglerConfig: {
				main: "./workers/app.ts",
			},
		};
	}

	configurationDescription = "Configuring project for React Router";
}
