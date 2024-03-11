import { resolve } from "node:path";
import { cloudflare, env, nodeless } from "unenv";
import { getBasePath } from "../../paths";
import type { Plugin } from "esbuild";

const REQUIRED_NODE_BUILT_IN_NAMESPACE = "node-built-in-modules";

export const nodejsHybridPlugin: () => Plugin = () => {
	const { alias, /* inject, */ polyfill, external } = env(nodeless, cloudflare);

	return {
		name: "unenv-cloudflare",
		setup(build) {
			const re = new RegExp(`^(${Object.keys(alias).join("|")})$`);

			// HACK: We need to inject the global polyfills.
			// It seems that unenv doesn't do this for Buffer
			polyfill.push(resolve(getBasePath(), "templates/_buffer.js"));
			// HACK: esbuild wants to rename the exported `Buffer` in `_buffer.js` (e.g. to `Buffer2`)
			// so we actually export it as _Buffer and then "define" `Buffer` to be `_Buffer`.
			build.initialOptions.define = {
				...build.initialOptions.define,
				Buffer: "_Buffer",
			};

			build.initialOptions.inject = [
				...(build.initialOptions.inject ?? []),
				...polyfill,
			];

			// esbuild expects alias paths to be absolute
			const aliasAbsolute = Object.fromEntries(
				Object.entries(alias).map(([key, value]) => [
					key,
					require.resolve(value).replace(/\.cjs$/, ".mjs"),
				])
			);

			build.onResolve(
				{
					filter: re,
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
		},
	};
};
