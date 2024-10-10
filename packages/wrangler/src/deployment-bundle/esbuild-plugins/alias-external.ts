import type { Plugin } from "esbuild";

/**
 * A simple plugin to alias modules and mark them as external
 */
export function esbuildAliasExternalPlugin(
	aliases: Record<string, string>
): Plugin {
	return {
		name: "external-alias-imports",
		setup(build) {
			build.onResolve({ filter: /.*/g }, (args) => {
				// If it's the entrypoint, let it be as is
				if (args.kind === "entry-point") {
					return {
						path: args.path,
					};
				}
				// If it's not a recognized alias, then throw an error
				if (!Object.keys(aliases).includes(args.path)) {
					throw new Error("unrecognized module: " + args.path);
				}

				// Otherwise, return the alias
				return {
					path: aliases[args.path as keyof typeof aliases],
					external: true,
				};
			});
		},
	};
}
