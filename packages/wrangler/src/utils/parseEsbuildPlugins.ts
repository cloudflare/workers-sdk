import { logger } from "../logger";
import type { Config } from "../config";
import type { Plugin } from "esbuild";

type PluginFunction = () => Plugin;

/**
 * Parses esbuild plugins based on given arguments and ensures that they are valid.
 */
export async function parseEsbuildPlugins(
	args: {
		bundle?: boolean | undefined;
	},
	config: Config
) {
	if (config.esbuild_plugins && !(args.bundle ?? !config.no_bundle)) {
		throw new Error(
			"You cannot pass esbuild plugins while not using the built in bundler!"
		);
	}

	const plugins: (Plugin & { _wranglerImportPath: string })[] = [];
	if (config.esbuild_plugins) {
		// Ensure all given plugins are valid and add them to the plugins array
		for (const plugin of config.esbuild_plugins) {
			if (plugin.endsWith(".ts"))
				throw new Error(
					`Error when importing esbuild plugin "${plugin}": TypeScript is not supported. Please ensure that you are providing a package or .js file.`
				);

			let importObj: { default: { default: PluginFunction } };
			try {
				let importPath = plugin;

				// Catch local files
				if (importPath.startsWith(".") || importPath.endsWith(".js"))
					importPath = `${process.cwd()}/${plugin}`;

				importObj = await import(importPath);
			} catch (e: unknown) {
				throw new Error(
					`Error when importing esbuild plugin "${plugin}": ${
						(e as Error).message
					}`
				);
			}

			// There's probably a better way to do this; it also probably won't work for some plugins
			// however anybody using the option could get around this by making a file that exports
			// a function that returns the plugin.
			let importEntry: PluginFunction | { default: PluginFunction } =
				importObj.default;
			if (Object.hasOwn(importEntry, "default"))
				importEntry = importEntry.default;

			if (typeof importEntry != "function")
				throw new Error(
					`Error while importing esbuild plugin "${plugin}": Couldn't find an esbuild plugin function! Make sure the plugin either returns a valid esbuild plugin object or an array of valid esbuild plugin objects.`
				);

			// Allow for an array of plugins
			const importEntryResults = importEntry();
			let pluginEntries = [importEntryResults];
			if (Array.isArray(importEntryResults))
				pluginEntries = [...importEntryResults];

			for (const pluginEntry of pluginEntries) {
				plugins.push({ ...pluginEntry, _wranglerImportPath: plugin });
			}
		}

		logger.info(
			`Using esbuild plugins: ${plugins
				.map((plugin) => `${plugin.name} (${plugin._wranglerImportPath})`)
				.join(", ")}`
		);
	}

	// Remove _wranglerImportPath because esbuild doesn't like it
	return plugins.map(({ _wranglerImportPath, ...plugin }) => plugin) as Plugin[];
}
