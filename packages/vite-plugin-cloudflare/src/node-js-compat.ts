import assert from "node:assert";
import { cloudflare } from "@cloudflare/unenv-preset";
import MagicString from "magic-string";
import { getNodeCompat } from "miniflare";
import { defineEnv } from "unenv";
import { resolvePluginConfig } from "./plugin-config";
import type {
	PluginConfig,
	ResolvedPluginConfig,
	WorkerConfig,
} from "./plugin-config";
import type { Plugin } from "vite";

/**
 * A Vite plugin that can provide Node.js compatibility support for Vite Environments that are hosted in Cloudflare Workers.
 */
export function nodejsCompatPlugin(pluginConfig: PluginConfig): Plugin {
	let resolvedPluginConfig: ResolvedPluginConfig;
	return {
		name: "vite-plugin-nodejs-compat",
		config(userConfig, env) {
			// Capture the configuration of the Cloudflare Workers for use in other hooks, below.
			resolvedPluginConfig = resolvePluginConfig(pluginConfig, userConfig, env);

			// Configure Vite with the Node.js polyfill aliases
			// We have to do this across the whole Vite config because it is not possible to do it per Environment.
			return {
				resolve: {
					alias: getNodeCompatAliases(),
				},
			};
		},
		configEnvironment(environmentName) {
			if (resolvedPluginConfig.type === "assets-only") {
				return;
			}

			const workerConfig = resolvedPluginConfig.workers[environmentName];
			if (!workerConfig) {
				return;
			}

			if (!isNodeCompat(workerConfig)) {
				return;
			}

			// Ignore the Node.js external modules when building.
			return {
				build: {
					rollupOptions: {
						external: getNodeCompatExternals(),
					},
				},
			};
		},
		async resolveId(source) {
			if (resolvedPluginConfig.type === "assets-only") {
				return;
			}

			const workerConfig = resolvedPluginConfig.workers[this.environment.name];
			if (!workerConfig) {
				return;
			}

			const unresolvedAlias = dealiasVirtualNodeJSImports(source, workerConfig);
			if (!unresolvedAlias) {
				return;
			}

			const resolvedAlias = await this.resolve(
				unresolvedAlias,
				import.meta.url
			);
			if (!resolvedAlias) {
				return;
			}

			if (this.environment.mode === "dev" && this.environment.depsOptimizer) {
				// Make sure the dependency optimizer is aware of this aliased import
				this.environment.depsOptimizer.registerMissingImport(
					unresolvedAlias,
					resolvedAlias.id
				);
			}

			return resolvedAlias;
		},
		async transform(code, id) {
			if (resolvedPluginConfig.type === "assets-only") {
				return;
			}

			const workerConfig = resolvedPluginConfig.workers[this.environment.name];
			if (!workerConfig) {
				return;
			}

			if (!isNodeCompat(workerConfig)) {
				return;
			}

			const resolvedId = await this.resolve(workerConfig.main);
			if (id === resolvedId?.id) {
				return injectGlobalCode(id, code);
			}
		},
	};
}

const { env } = defineEnv({
	nodeCompat: true,
	presets: [cloudflare],
});

const CLOUDFLARE_VIRTUAL_PREFIX = "\0cloudflare-";

/**
 * Returns true if the given combination of compat dates and flags means that we need Node.js compatibility.
 */
function isNodeCompat({
	compatibility_date,
	compatibility_flags,
}: WorkerConfig): boolean {
	const nodeCompatMode = getNodeCompat(
		compatibility_date,
		compatibility_flags ?? []
	).mode;
	if (nodeCompatMode === "v2") {
		return true;
	}
	if (nodeCompatMode === "legacy") {
		throw new Error(
			"Unsupported Node.js compat mode (legacy). Remove the `node_compat` setting and add the `nodejs_compat` flag instead."
		);
	}
	if (nodeCompatMode === "v1") {
		throw new Error(
			`Unsupported Node.js compat mode (v1). Only the v2 mode is supported, either change your compat date to "2024-09-23" or later, or set the "nodejs_compat_v2" compatibility flag`
		);
	}
	return false;
}

/**
 * If the current environment needs Node.js compatibility,
 * then inject the necessary global polyfills into the code.
 */
function injectGlobalCode(id: string, code: string) {
	const injectedCode = Object.entries(env.inject)
		.map(([globalName, globalInject]) => {
			if (typeof globalInject === "string") {
				const moduleSpecifier = globalInject;
				// the mapping is a simple string, indicating a default export, so the string is just the module specifier.
				return `import var_${globalName} from "${moduleSpecifier}";\nglobalThis.${globalName} = var_${globalName};\n`;
			}

			// the mapping is a 2 item tuple, indicating a named export, made up of a module specifier and an name.
			const [moduleSpecifier, exportName] = globalInject;
			return `import var_${globalName} from "${moduleSpecifier}";\nglobalThis.${globalName} = var_${globalName}.${exportName};\n`;
		})
		.join("\n");

	const modified = new MagicString(code);
	modified.prepend(injectedCode);
	return {
		code: modified.toString(),
		map: modified.generateMap({ hires: "boundary", source: id }),
	};
}

/**
 * We only want to alias Node.js built-ins if the environment has Node.js compatibility turned on.
 * But Vite only allows us to configure aliases at the shared options level, not per environment.
 * So instead we alias these to a virtual module, which are then handled with environment specific code in the `resolveId` handler
 */
function getNodeCompatAliases() {
	const aliases: Record<string, string> = {};
	Object.keys(env.alias).forEach((key) => {
		// Don't create aliases for modules that are already marked as external
		if (!env.external.includes(key)) {
			aliases[key] = CLOUDFLARE_VIRTUAL_PREFIX + key;
		}
	});
	return aliases;
}

/**
 * Get an array of modules that should be considered external.
 */
function getNodeCompatExternals(): string[] {
	return env.external;
}

/**
 * Convert any virtual module Id that was generated by the aliases returned from `getNodeCompatAliases()`
 * back to real a module Id and whether it is an external (built-in) package or not.
 */
function dealiasVirtualNodeJSImports(
	source: string,
	workerConfig: WorkerConfig
) {
	if (!source.startsWith(CLOUDFLARE_VIRTUAL_PREFIX)) {
		return;
	}

	const from = source.slice(CLOUDFLARE_VIRTUAL_PREFIX.length);
	if (!isNodeCompat(workerConfig)) {
		// We are not in node compat mode so just return the original module specifier
		return from;
	}

	const alias = env.alias[from];
	if (!alias) {
		return;
	}

	assert(
		!env.external.includes(alias),
		`Unexpected unenv alias to external module: ${source} -> ${alias}`
	);
	return alias;
}
