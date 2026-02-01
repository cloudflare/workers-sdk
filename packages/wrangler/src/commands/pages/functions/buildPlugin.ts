import { access, lstat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { bundleWorker } from "../../../deployment-bundle/bundle";
import { createModuleCollector } from "../../../deployment-bundle/module-collection";
import { getBasePath } from "../../../paths";
import { getPagesProjectRoot } from "../utils";
import { buildNotifierPlugin } from "./buildWorker";
import type { Entry } from "../../../deployment-bundle/entry";
import type { Options as WorkerOptions } from "./buildWorker";

type Options = Omit<
	WorkerOptions,
	"outfile" | "fallbackService" | "buildOutputDirectory" | "nodejsCompat"
> & { outdir: string };

export function buildPluginFromFunctions({
	routesModule,
	outdir,
	minify = false,
	keepNames = true,
	sourcemap = false,
	watch = false,
	onEnd = () => {},
	nodejsCompatMode,
	functionsDirectory,
	local,
	defineNavigatorUserAgent,
	checkFetch,
	external,
}: Options) {
	const entry: Entry = {
		file: resolve(getBasePath(), "templates/pages-template-plugin.ts"),
		projectRoot: functionsDirectory,
		configPath: undefined,
		format: "modules",
		moduleRoot: functionsDirectory,
		exports: [],
	};
	const moduleCollector = createModuleCollector({
		entry,
		findAdditionalModules: false,
	});
	return bundleWorker(entry, resolve(outdir), {
		bundle: true,
		additionalModules: [],
		moduleCollector,
		inject: [routesModule],
		entryName: "index",
		minify,
		keepNames,
		sourcemap,
		watch,
		// We don't currently have a mechanism for Plugins 'requiring' a specific compat date/flag,
		// but if someone wants to publish a Plugin which does require this new `nodejs_compat` flag
		// and they document that on their README.md, we should let them.
		nodejsCompatMode: nodejsCompatMode ?? "v1",
		compatibilityDate: undefined,
		compatibilityFlags: undefined,
		define: {},
		alias: {},
		doBindings: [], // Pages functions don't support internal Durable Objects
		workflowBindings: [], // Pages functions don't support internal Workflows
		external,
		plugins: [
			buildNotifierPlugin(onEnd),
			{
				name: "Assets",
				setup(pluginBuild) {
					pluginBuild.onResolve({ filter: /^assets:/ }, async (args) => {
						const directory = resolve(
							args.resolveDir,
							args.path.slice("assets:".length)
						);

						const exists = await access(directory)
							.then(() => true)
							.catch(() => false);

						const isDirectory =
							exists && (await lstat(directory)).isDirectory();

						if (!isDirectory) {
							return {
								errors: [
									{
										text: `'${directory}' does not exist or is not a directory.`,
									},
								],
							};
						}

						const path = `assets:./${relative(outdir, directory)}`;

						return { path, external: true, namespace: "assets" };
					});
				},
			},
			// TODO: Replace this with a proper outdir solution for Plugins
			// But for now, let's just mark all wasm/bin files as external
			{
				name: "Mark externals",
				setup(pluginBuild) {
					pluginBuild.onResolve({ filter: /.*\.(wasm|bin)$/ }, async (args) => {
						return {
							external: true,
							path: `./${relative(
								outdir,
								resolve(args.resolveDir, args.path)
							)}`,
						};
					});
				},
			},
		],
		checkFetch: local && checkFetch,
		targetConsumer: local ? "dev" : "deploy",
		local,
		projectRoot: getPagesProjectRoot(),
		defineNavigatorUserAgent,

		jsxFactory: undefined,
		jsxFragment: undefined,
		tsconfig: undefined,
		testScheduled: undefined,
		isOutfile: undefined,
		metafile: undefined,
	});
}
