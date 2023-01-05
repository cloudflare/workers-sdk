import { Plugin } from "esbuild";
import { Config } from "../config";
import { logger } from "../logger";

/**
 * Parses esbuild plugins based on given arguments and ensures that they are valid.
 */
export async function parseEsbuildPlugins(args: {"esbuild-plugins": string[], bundle?: boolean | undefined}, config: Config) {
	if (args["esbuild-plugins"] && !(args.bundle ?? !config.no_bundle)) {
		throw new Error("You cannot pass esbuild plugins while not using the built in bundler!");
	}

	const plugins: Plugin[] = [];
	if (args["esbuild-plugins"]) {
		// Ensure all given plugins are valid and add them to the plugins array
		for (const plugin of args["esbuild-plugins"]) {
			if (plugin.endsWith(".ts"))
				throw new Error(`Error when importing esbuild plugin "${plugin}": TypeScript is not supported. Please ensure that you are providing a package or .js file.`)

			let pluginObj: any;
			try {
				let importPath = plugin;

				// Catch local files
				if (importPath.startsWith(".") || importPath.endsWith(".js"))
					importPath = `${process.cwd()}/${plugin}`

				pluginObj = await import(importPath);
			} catch(e: any) {
				throw new Error(`Error when importing esbuild plugin "${plugin}": ${e.message}`);
			}
			// There's probably a better way to do this; it also probably won't work for some plugins
			// however anybody using the option could get around this by making a file that exports
			// a function that returns the plugin's function.
			let pluginFunction = pluginObj.default;
			if (Object.hasOwn(pluginFunction, "default"))
				pluginFunction = pluginFunction.default;

			if (typeof pluginFunction != "function")
				throw new Error(`Error while importing esbuild plugin "${plugin}": Couldn't find an esbuild plugin function!`)

			plugins.push(pluginFunction());
		}
		logger.info(`Using esbuild plugins: ${plugins.map((val, i) => `${val.name} (${args["esbuild-plugins"][i]})`).join(", ")}`);
	}

	return plugins;
}