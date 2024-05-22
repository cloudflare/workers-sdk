import nodePath from "node:path";
import { cloudflare, env, nodeless } from "unenv";
import { getBasePath } from "../../paths";
import type { Plugin } from "esbuild";

const REQUIRED_NODE_BUILT_IN_NAMESPACE = "node-built-in-modules";

export const nodejsHybridPlugin: () => Plugin = () => {
	const { alias, inject, /* polyfill, */ external } = env(nodeless, cloudflare);

	return {
		name: "unenv-cloudflare",
		setup(build) {
			const UNENV_ALIAS_RE = new RegExp(`^(${Object.keys(alias).join("|")})$`);

			// esbuild expects alias paths to be absolute
			const aliasAbsolute = Object.fromEntries(
				Object.entries(alias).map(([key, value]) => [
					key,
					require.resolve(value).replace(/\.cjs$/, ".mjs"),
				])
			);

			build.onResolve(
				{
					filter: UNENV_ALIAS_RE,
				},
				(args) => {
					const result = aliasAbsolute[args.path];
					if (result.startsWith("node:") && args.kind === "require-call") {
						// we must convert `require("node:*")` to ESM imports
						// Tag with a namespace that can be specially handled in onLoad
						return {
							path: result,
							namespace: REQUIRED_NODE_BUILT_IN_NAMESPACE,
						};
					} else if (result) {
						// If we match an alias then return that and potentially mark it as external
						return { path: result, external: external.includes(result) };
					} else {
						// Otherwise continue
						return undefined;
					}
				}
			);

			// Requires of node-built-in-modules are converted to embed a file that does an ESM import
			build.onLoad(
				{ filter: /.*/, namespace: REQUIRED_NODE_BUILT_IN_NAMESPACE },
				({ path }) => {
					return {
						contents: `export * from '${path}'`,
						loader: "js",
					};
				}
			);

			// Inject node globals defined in unenv's `inject` config via virtual modules
			const UNENV_GLOBALS_RE = /_virtual_unenv_global_polyfill-([^.]+)\.js$/;

			build.initialOptions.inject = [
				...(build.initialOptions.inject ?? []),
				// convert unenv's inject keys to absolute specifiers of custom virtual modules that will be provided via a custom onLoad
				...Object.keys(inject).map((globalName) =>
					nodePath.resolve(
						getBasePath(),
						`_virtual_unenv_global_polyfill-${globalName}.js`
					)
				),
			];

			build.onResolve({ filter: UNENV_GLOBALS_RE }, ({ path }) => {
				return {
					path: path,
				};
			});

			build.onLoad({ filter: UNENV_GLOBALS_RE }, ({ path }) => {
				// eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
				const globalName = path.match(UNENV_GLOBALS_RE)![1];
				const globalMapping = inject[globalName];

				if (typeof globalMapping === "string") {
					const globalPolyfillSpecifier = globalMapping;

					return {
						contents: `
							import globalVar from "${globalPolyfillSpecifier}";

							// ESBuild's inject doesn't actually touch globalThis, so let's do it ourselves
							// by creating an exportable so that we can preserve the globalThis assignment if
							// the ${globalName} was found in the app, or tree-shake it, if it wasn't
							// see https://esbuild.github.io/api/#inject
							const exportable =
								// mark this as a PURE call so it can be ignored and tree-shaken by ESBuild,
								// when we don't detect 'process', 'global.process', or 'globalThis.process'
								// in the app code
								// see https://esbuild.github.io/api/#tree-shaking-and-side-effects
								/* @__PURE__ */ (() => {
									// TODO: should we try to preserve globalThis.${globalName} if it exists?
									return globalThis.${globalName} = globalVar;
								})();

							export {
								exportable as '${globalName}',
								exportable as 'globalThis.${globalName}',
							}
						`,
					};
				}

				const [moduleName, exportName] = inject[globalName];

				return {
					contents: `
						import { ${exportName} } from "${moduleName}";

						// ESBuild's inject doesn't actually touch globalThis, so let's do it ourselves
						// by creating an exportable so that we can preserve the globalThis assignment if
						// the ${globalName} was found in the app, or tree-shake it, if it wasn't
						// see https://esbuild.github.io/api/#inject
						const exportable =
							// mark this as a PURE call so it can be ignored and tree-shaken by ESBuild,
							// when we don't detect 'process', 'global.process', or 'globalThis.process'
							// in the app code
							// see https://esbuild.github.io/api/#tree-shaking-and-side-effects
							/* @__PURE__ */ (() => {
								// TODO: should we try to preserve globalThis.${globalName} if it exists?
								return globalThis.${globalName} = ${exportName};
						})();

						export {
							exportable as '${globalName}',
							exportable as 'global.${globalName}',
							exportable as 'globalThis.${globalName}'
						}
					`,
				};
			});
		},
	};
};
