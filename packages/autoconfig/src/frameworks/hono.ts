import { existsSync } from "node:fs";
import { dirname, posix, relative, resolve, sep } from "node:path";
import { brandColor, dim } from "@cloudflare/cli-shared-helpers/colors";
import { installPackages } from "@cloudflare/cli-shared-helpers/packages";
import { parseFile } from "@cloudflare/shared-ast-primitives";
import * as recast from "recast";
import { AutoConfigFrameworkConfigurationError } from "../errors";
import { Framework } from "./framework-class";
import { readPackageJson } from "./utils/packages";
import {
	assertViteConfigCanBeTransformed,
	getStaticPropertyName,
	getViteConfigPath,
	hasViteConfig,
	transformViteConfig,
} from "./utils/vite-config";
import { installCloudflareVitePlugin } from "./utils/vite-plugin";
import { CF_VITE_PLUGIN_VERSION_RANGE } from "./utils/vite-plugin-version";
import { createViteConfig } from "./vite";
import type { WranglerConfig } from "../types";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

const t = recast.types.namedTypes;

/** The app's entry files that Hono's own Vite plugins use when none is configured */
const DEFAULT_ENTRIES = ["src/index.ts", "src/index.tsx"];

/**
 * Sets a Hono app up to build with Vite and the Cloudflare plugin, as in Hono's Workers + Vite
 * starter. Hono's own dev server and build plugins are replaced, since the Cloudflare plugin
 * runs and builds the app itself.
 */
export class Hono extends Framework {
	async configure({
		dryRun,
		projectPath,
		packageManager,
		isWorkspaceRoot,
		target,
		wranglerConfig,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		const packageJson = readPackageJson(projectPath);
		const dependencies = {
			...packageJson?.dependencies,
			...packageJson?.devDependencies,
		};
		if ("honox" in dependencies) {
			throw new AutoConfigFrameworkConfigurationError(
				"cf can't set up HonoX projects automatically yet. Set up the project's build and `cloudflare.config.ts` by hand, then run cf again.",
				{ telemetryMessage: "autoconfig honox setup unsupported" }
			);
		}

		const viteConfigExists = hasViteConfig(projectPath);
		if (viteConfigExists) {
			assertViteConfigCanBeTransformed(projectPath);
		}
		const honoVitePlugins = viteConfigExists
			? readHonoVitePlugins(projectPath)
			: { names: [], entries: [] };
		const entrypoint = findEntrypoint(
			projectPath,
			wranglerConfig,
			honoVitePlugins.entries
		);

		if (!dryRun) {
			// Vite+ provides Vite itself
			if (!("vite" in dependencies) && !("vite-plus" in dependencies)) {
				await installPackages(packageManager.type, ["vite"], {
					dev: true,
					startText: "Installing Vite",
					doneText: `${brandColor("installed")} ${dim("vite")}`,
					isWorkspaceRoot,
				});
			}
			await installCloudflareVitePlugin({
				packageManager: packageManager.type,
				isWorkspaceRoot,
				projectPath,
				version: CF_VITE_PLUGIN_VERSION_RANGE,
			});

			if (viteConfigExists) {
				transformViteConfig(projectPath, {
					incompatibleVitePlugins: honoVitePlugins.names,
				});
			} else {
				createViteConfig(projectPath, target);
			}
		}

		return {
			buildTool: "vite",
			workerConfig: { entrypoint: `./${entrypoint}` },
		};
	}
}

/**
 * Reads the plugins from Hono's `@hono/vite-dev-server` and `@hono/vite-build` packages in the
 * project's Vite config.
 *
 * @param projectPath The project's path
 * @returns The plugins' local names, and the app entries they're given, the build's first
 */
function readHonoVitePlugins(projectPath: string): {
	names: string[];
	entries: string[];
} {
	const ast = parseFile(getViteConfigPath(projectPath));
	const devServerNames = new Set<string>();
	const buildNames = new Set<string>();
	const devServerEntries: string[] = [];
	const buildEntries: string[] = [];
	if (!ast) {
		return { names: [], entries: [] };
	}

	for (const statement of ast.body) {
		if (!t.ImportDeclaration.check(statement)) {
			continue;
		}
		const source = String(statement.source.value);
		const names =
			source === "@hono/vite-dev-server"
				? devServerNames
				: source === "@hono/vite-build" ||
					  source.startsWith("@hono/vite-build/")
					? buildNames
					: undefined;
		for (const specifier of statement.specifiers ?? []) {
			if (
				names &&
				t.ImportDefaultSpecifier.check(specifier) &&
				specifier.local
			) {
				names.add(String(specifier.local.name));
			}
		}
	}

	recast.visit(ast, {
		visitCallExpression(path) {
			const { callee, arguments: [options] = [] } = path.node;
			const entries = !t.Identifier.check(callee)
				? undefined
				: devServerNames.has(callee.name)
					? devServerEntries
					: buildNames.has(callee.name)
						? buildEntries
						: undefined;
			if (entries && t.ObjectExpression.check(options)) {
				const entry = options.properties.find(
					(property) => getStaticPropertyName(property) === "entry"
				);
				if (t.Property.check(entry) || t.ObjectProperty.check(entry)) {
					const values = t.ArrayExpression.check(entry.value)
						? entry.value.elements
						: [entry.value];
					for (const value of values) {
						if (
							(t.StringLiteral.check(value) || t.Literal.check(value)) &&
							typeof value.value === "string"
						) {
							entries.push(value.value);
						}
					}
				}
			}
			this.traverse(path);
		},
	});

	return {
		names: [...devServerNames, ...buildNames],
		entries: [...buildEntries, ...devServerEntries],
	};
}

/**
 * Finds the file that exports the Hono app: the Worker entry point in the project's Wrangler
 * config, else the entry given to Hono's Vite plugins, else one of their default entries.
 *
 * @param projectPath The project's path
 * @param wranglerConfig The project's Wrangler config, if any
 * @param vitePluginEntries The entries given to Hono's Vite plugins
 * @returns The entry file, relative to the project
 * @throws {AutoConfigFrameworkConfigurationError} If there is no such file, or it doesn't export the app
 */
function findEntrypoint(
	projectPath: string,
	wranglerConfig: WranglerConfig | undefined,
	vitePluginEntries: string[]
): string {
	const wranglerEntries =
		wranglerConfig?.main === undefined
			? []
			: [
					resolve(
						wranglerConfig.configPath
							? dirname(wranglerConfig.configPath)
							: projectPath,
						wranglerConfig.main
					),
				];
	const entry = [...wranglerEntries, ...vitePluginEntries, ...DEFAULT_ENTRIES]
		.map((file) => resolve(projectPath, file))
		.find((file) => existsSync(file));
	if (entry === undefined) {
		throw new AutoConfigFrameworkConfigurationError(
			`Could not find the Hono app's entry file. cf looks for the \`entry\` given to Hono's Vite plugins, or else ${DEFAULT_ENTRIES.map((file) => `\`${file}\``).join(" or ")}.`,
			{ telemetryMessage: "autoconfig hono entry missing" }
		);
	}

	const entrypoint = relative(projectPath, entry).split(sep).join(posix.sep);
	if (!hasDefaultExport(entry)) {
		throw new AutoConfigFrameworkConfigurationError(
			`\`${entrypoint}\` doesn't export the Hono app, so it can't run as a Worker. Export the app with \`export default app\`, and start any Node.js server from a separate file.`,
			{ telemetryMessage: "autoconfig hono entry without default export" }
		);
	}

	return entrypoint;
}

function hasDefaultExport(file: string): boolean {
	return (
		parseFile(file)?.body.some(
			(statement) =>
				t.ExportDefaultDeclaration.check(statement) ||
				(t.ExportNamedDeclaration.check(statement) &&
					(statement.specifiers ?? []).some(
						(specifier) =>
							t.Identifier.check(specifier.exported) &&
							specifier.exported.name === "default"
					))
		) ?? false
	);
}
