import fs from "node:fs";
import path from "node:path";
import { pluginCloudflare } from "@cloudflare/rsbuild-plugin";
import { createLogger, createRsbuild, mergeRsbuildConfig } from "@rsbuild/core";
import { pluginBasicSsl } from "@rsbuild/plugin-basic-ssl";
import { pluginReact } from "@rsbuild/plugin-react";
import type { PluginConfig } from "@cloudflare/vite-plugin";
import type {
	EnvironmentConfig,
	RsbuildConfig,
	RsbuildPlugin,
} from "@rsbuild/core";
import type {
	InlineConfig,
	Logger as ViteLogger,
	Plugin,
	PluginOption,
} from "vite";

/**
 * Runs the playground suite against `@cloudflare/rsbuild-plugin` instead of
 * the Vite plugin when `CLOUDFLARE_TEST_BUNDLER=rsbuild`.
 */
export const isRsbuild = process.env.CLOUDFLARE_TEST_BUNDLER === "rsbuild";

/**
 * Builds (when `isBuild`) and serves a playground with Rsbuild, using the
 * options passed to `cloudflare()` in the playground's Vite config.
 *
 * @param viteConfig The playground's Vite config, as loaded by `loadConfig()`
 * @param options.isBuild Whether to build and preview instead of running the dev server
 * @returns The server's URL and a function that closes it
 */
export async function startRsbuildServe(
	viteConfig: InlineConfig,
	options: { isBuild: boolean }
): Promise<{ url: string; close: () => Promise<void> }> {
	const root = viteConfig.root ?? process.cwd();
	const config = await translateViteConfig(viteConfig, root);

	if (!options.isBuild) {
		// As the Rsbuild CLI does, recreate the server when a watched config
		// file changes. The port is inherited, so the URL stays the same.
		let server: { close: () => Promise<void> };
		const createDevRsbuild = async () =>
			createRsbuild({
				cwd: root,
				config: await translateViteConfig(viteConfig, root),
				async restart(context) {
					const rsbuild = await createDevRsbuild();
					({ server } = await rsbuild.startDevServer(
						context.action === "dev" ? context.options : undefined
					));
					return true;
				},
			});
		const devServer = await (await createDevRsbuild()).startDevServer();
		server = devServer.server;
		return {
			url: getUrl(devServer.urls, config),
			close: () => server.close(),
		};
	}

	const builder = await createRsbuild({
		cwd: root,
		config: { ...config, mode: "production" },
	});
	await (await builder.build()).close();
	// As in the Vite harness, preview runs in the same process after the build.
	delete process.env.CLOUDFLARE_VITE_BUILD;
	process.chdir(root);
	const rsbuild = await createRsbuild({ cwd: root, config });
	const { server, urls } = await rsbuild.preview();
	return { url: getUrl(urls, config), close: () => server.close() };
}

function getUrl(urls: string[], config: RsbuildConfig): string {
	const [url] = urls;
	if (url === undefined) {
		throw new Error("Rsbuild didn't report a server URL.");
	}
	const base = config.server?.base;
	// Unlike Vite's resolved URLs, Rsbuild's don't include the raw base.
	return base && base !== "/"
		? new URL(base, url).href
		: url.replace(/\/$/, "");
}

/**
 * Plugins that the harness knows how to replace with Rsbuild equivalents.
 * Playgrounds that use any other Vite plugin can't run with Rsbuild and are
 * excluded in `vitest.config.e2e.rsbuild.ts`.
 */
const portablePlugins: Array<{
	test: (name: string) => boolean;
	create?: () => RsbuildPlugin;
}> = [
	{ test: (name) => name.startsWith("vite-plugin-cloudflare") },
	{ test: (name) => name === "vite:react-refresh", create: pluginReact },
	{ test: (name) => name.startsWith("vite:react") },
	{ test: (name) => name === "vite:basic-ssl", create: pluginBasicSsl },
];

async function translateViteConfig(
	viteConfig: InlineConfig,
	root: string
): Promise<RsbuildConfig> {
	let pluginConfig: PluginConfig | undefined;
	const plugins: RsbuildPlugin[] = [];

	for (const plugin of await flattenPlugins(viteConfig.plugins)) {
		if (plugin.name === "vite-plugin-cloudflare") {
			pluginConfig = (plugin.api as { pluginConfig: PluginConfig })
				.pluginConfig;
		}
		const portable = portablePlugins.find(({ test }) => test(plugin.name));
		if (!portable) {
			throw new Error(
				`The Vite plugin "${plugin.name}" has no Rsbuild equivalent in the test harness.`
			);
		}
		const rsbuildPlugin = portable.create?.();
		if (rsbuildPlugin) {
			plugins.push(rsbuildPlugin);
		}
	}

	if (!pluginConfig) {
		throw new Error("The playground's Vite config doesn't use `cloudflare()`.");
	}

	const config: RsbuildConfig = {
		root,
		mode: "development",
		plugins: [
			pluginCloudflare({
				...pluginConfig,
				envDir: viteConfig.envDir,
				envMode: viteConfig.mode,
			}),
			...plugins,
		],
		server: {
			port: 0,
			base: viteConfig.base,
			headers: viteConfig.server?.headers as Record<string, string>,
			// Vite's dev server serves files from the root as well as `public/`.
			publicDir: [{ name: "public" }, { name: root, copyOnBuild: false }],
		},
		resolve: { alias: viteConfig.resolve?.alias as Record<string, string> },
		// Vite resolves root-relative imports (e.g. `/vite.svg`) from `publicDir`,
		// then the root.
		tools: {
			rspack: {
				resolve: { roots: [path.join(root, "public"), root] },
				// Vite supports `?raw` and `?url` for every file, Rsbuild only for
				// its asset types.
				module: {
					rules: [
						{ test: /\.html$/, resourceQuery: /^\?raw$/, type: "asset/source" },
						{
							test: /\.(json|txt)$/,
							resourceQuery: /^\?url$/,
							type: "asset/resource",
						},
					],
				},
			},
		},
		environments: {
			cloudflare: getWorkerEnvironment(viteConfig.environments?.ssr?.build),
		},
		customLogger: createForwardingLogger(viteConfig.customLogger),
	};
	return mergeRsbuildConfig(config, getHtmlEntries(viteConfig, root));
}

/** Maps the entry Worker's Vite build options that playgrounds set. */
function getWorkerEnvironment(
	build: NonNullable<InlineConfig["build"]> | undefined
): EnvironmentConfig {
	const { output } = build?.rolldownOptions ?? {};
	const entryFileNames =
		output && !Array.isArray(output) ? output.entryFileNames : undefined;
	return {
		output: {
			...(build?.sourcemap === false && { sourceMap: { js: false } }),
			...(typeof entryFileNames === "string" && {
				filename: { js: entryFileNames.replace("[hash]", "[contenthash:8]") },
			}),
		},
	};
}

/**
 * Vite uses HTML files (by default `index.html`) as the client entries,
 * whereas Rsbuild needs a script entry per page and injects it into the HTML.
 */
function getHtmlEntries(viteConfig: InlineConfig, root: string): RsbuildConfig {
	const input =
		viteConfig.environments?.client?.build?.rolldownOptions?.input ??
		path.join(root, "index.html");
	const htmlPaths = (typeof input === "string" ? [input] : Object.values(input))
		.map((file) => path.resolve(root, file))
		.filter((file) => file.endsWith(".html") && fs.existsSync(file));
	if (htmlPaths.length === 0) {
		return {};
	}
	const scriptRE = /\s*<script type="module" src="\/([^"]+)"><\/script>/;
	const entry: Record<string, string> = {};
	const templates = new Map<string, string>();
	for (const htmlPath of htmlPaths) {
		const html = fs.readFileSync(htmlPath, "utf8");
		// Rsbuild writes each page to `<entry name>.html`.
		const entryName = path
			.relative(root, htmlPath)
			.replace(/\.html$/, "")
			.replaceAll(path.sep, "/");
		const script = html.match(scriptRE)?.[1];
		// Pages without a script still need an entry.
		entry[entryName] = script ? `./${script}` : "data:text/javascript,";
		templates.set(entryName, html.replace(scriptRE, ""));
	}
	return {
		source: { entry },
		// The templates already have a title and meta tags.
		html: {
			inject: "body",
			title: "",
			meta: { charset: false, viewport: false },
		},
		tools: {
			htmlPlugin: (config, { entryName }) => {
				config.templateContent = templates.get(entryName);
			},
		},
	};
}

async function flattenPlugins(option: PluginOption): Promise<Plugin[]> {
	const resolved = await option;
	if (!resolved) {
		return [];
	}
	if (Array.isArray(resolved)) {
		return (await Promise.all(resolved.map(flattenPlugins))).flat();
	}
	return [resolved as Plugin];
}

/**
 * Forwards Rsbuild's logs to the Vite config's logger, which the test setup
 * creates to record them at the playground's log level.
 */
function createForwardingLogger(viteLogger: ViteLogger | undefined) {
	if (!viteLogger) {
		throw new Error("The test setup didn't provide a Vite logger.");
	}
	const logger = createLogger();
	const format = (message: unknown, args: unknown[]) =>
		[message, ...args].map(String).join(" ");
	const info = (message?: unknown, ...args: unknown[]) =>
		viteLogger.info(format(message, args));
	logger.override({
		info,
		log: info,
		ready: info,
		start: info,
		success: info,
		debug: () => {},
		warn: (message, ...args) => viteLogger.warn(format(message, args)),
		error: (message, ...args) => viteLogger.error(format(message, args)),
	});
	return logger;
}
