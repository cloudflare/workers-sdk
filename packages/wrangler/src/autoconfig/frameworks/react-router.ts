import assert from "node:assert";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { brandColor, dim } from "@cloudflare/cli-shared-helpers/colors";
import { installPackages } from "@cloudflare/cli-shared-helpers/packages";
import { transformFile } from "@cloudflare/codemod";
import * as recast from "recast";
import semiver from "semiver";
import dedent from "ts-dedent";
import { logger } from "../../logger";
import { Framework } from "./framework-class";
import { transformViteConfig } from "./utils/vite-config";
import { installCloudflareVitePlugin } from "./utils/vite-plugin";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

const b = recast.types.builders;

/**
 * Ensures a future flag property exists in the `future` object expression and is set to `true`.
 * If the property already exists, its value is set to `true`. Otherwise, a new property is added.
 *
 * @param futureObject - The AST `ObjectExpression` node representing the `future` config block.
 * @param flagName - The name of the future flag to ensure (e.g. `"v8_middleware"`).
 */
function ensureFutureFlag(
	futureObject: recast.types.namedTypes.ObjectExpression,
	flagName: string
) {
	const existingIndex = futureObject.properties.findIndex(
		(p) =>
			p.type === "ObjectProperty" &&
			p.key.type === "Identifier" &&
			p.key.name === flagName &&
			p.value.type === "BooleanLiteral"
	);

	if (existingIndex !== -1) {
		const prop = futureObject.properties[existingIndex];
		assert(
			prop.type === "ObjectProperty" && prop.value.type === "BooleanLiteral"
		);
		prop.value.value = true;
	} else {
		futureObject.properties.push(
			b.objectProperty(b.identifier(flagName), b.booleanLiteral(true))
		);
	}
}

function transformReactRouterConfig(
	projectPath: string,
	futureFlags: string[]
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

	const flagList = futureFlags.join(", ");

	transformFile(filePath, {
		/**
		 * Visit an export default declaration of the form:
		 *
		 *   export default {
		 *     ...
		 *   }
		 *
		 * and add or modify the `future` property to include the required v8 future flags.
		 *
		 * For some extra complexity, this also supports TS `as` and `satisfies` expressions.
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
					`Could not parse React Router config file. Please add the following snippet manually:\n  future: {\n    ${flagList}: true,\n  }`
				);
			}

			assert(node.type === "ObjectExpression");

			// Is there an existing `future` key? If there is, we should modify it rather than creating a new one
			const futureKeyIndex = node.properties.findIndex(
				(p) =>
					p.type === "ObjectProperty" &&
					p.key.type === "Identifier" &&
					p.key.name === "future" &&
					p.value.type === "ObjectExpression"
			);
			if (futureKeyIndex !== -1) {
				const future = node.properties[futureKeyIndex];
				assert(
					future.type === "ObjectProperty" &&
						future.value.type === "ObjectExpression"
				);

				for (const flag of futureFlags) {
					ensureFutureFlag(future.value, flag);
				}
			} else {
				node.properties.push(
					b.objectProperty(
						b.identifier("future"),
						b.objectExpression(
							futureFlags.map((flag) =>
								b.objectProperty(b.identifier(flag), b.booleanLiteral(true))
							)
						)
					)
				);
			}

			return false;
		},
	});
}

/**
 * Returns the list of v8 future flags to enable based on the installed React Router version.
 *
 * Version gates:
 * - < 7.10.0: unstable_viteEnvironmentApi only
 * - >= 7.10.0: v8_viteEnvironmentApi, v8_splitRouteModules, v8_middleware
 * - >= 7.15.0: adds v8_passThroughRequests
 * - >= 7.16.0: adds v8_trailingSlashAwareDataRequests (all 5 stable v8 flags)
 */
export function getV8FutureFlags(reactRouterVersion: string): string[] {
	if (!reactRouterVersion) {
		// Default to the full set of flags when version is unknown
		return [
			"v8_middleware",
			"v8_passThroughRequests",
			"v8_splitRouteModules",
			"v8_trailingSlashAwareDataRequests",
			"v8_viteEnvironmentApi",
		];
	}

	// version less than 7.10.0
	if (semiver(reactRouterVersion, "7.10.0") === -1) {
		return ["unstable_viteEnvironmentApi"];
	}

	const flags = [
		"v8_middleware",
		"v8_splitRouteModules",
		"v8_viteEnvironmentApi",
	];

	// v8_passThroughRequests was stabilized in 7.15.0
	if (semiver(reactRouterVersion, "7.15.0") >= 0) {
		flags.push("v8_passThroughRequests");
	}

	// v8_trailingSlashAwareDataRequests was stabilized in 7.16.0
	if (semiver(reactRouterVersion, "7.16.0") >= 0) {
		flags.push("v8_trailingSlashAwareDataRequests");
	}

	return flags.sort();
}

export class ReactRouter extends Framework {
	async configure({
		dryRun,
		projectPath,
		packageManager,
		isWorkspaceRoot,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		const futureFlags = getV8FutureFlags(this.frameworkVersion);
		if (!dryRun) {
			await installCloudflareVitePlugin({
				packageManager: packageManager.type,
				projectPath,
				isWorkspaceRoot,
			});

			mkdirSync("workers");

			writeFileSync(
				"workers/app.ts",
				dedent /* javascript */ `
					import { createRequestHandler } from "react-router";

					const requestHandler = createRequestHandler(
						() => import("virtual:react-router/server-build"),
						import.meta.env.MODE,
					);

					export default {
						async fetch(request) {
							return requestHandler(request);
						},
					} satisfies ExportedHandler<Env>;
				`
			);

			await installPackages(packageManager.type, ["isbot"], {
				dev: true,
				startText: "Installing the isbot package",
				doneText: `${brandColor(`installed`)} ${dim("isbot")}`,
				isWorkspaceRoot,
			});

			if (!existsSync("app/entry.server.tsx")) {
				writeFileSync(
					`app/entry.server.tsx`,
					dedent /* javascript */ `
					import type { EntryContext } from "react-router";
					import { ServerRouter } from "react-router";
					import { isbot } from "isbot";
					import { renderToReadableStream } from "react-dom/server";

					export default async function handleRequest(
						request: Request,
						responseStatusCode: number,
						responseHeaders: Headers,
						routerContext: EntryContext,
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
							},
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

			transformReactRouterConfig(projectPath, futureFlags);
		}

		return {
			wranglerConfig: {
				main: "./workers/app.ts",
			},
		};
	}

	configurationDescription = "Configuring project for React Router";
}
