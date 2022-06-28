import fs from "node:fs";
import path from "node:path";
import toSource from "tosource";
import type { Configuration } from "webpack";

export function writeWebpackConfig(
	config: Configuration = {},
	{
		filepath = "webpack.config.js",
		usePlugin = false,
	}: { filepath?: string; usePlugin?: boolean } = {}
) {
	let stringified = "";

	if (usePlugin) {
		stringified += `const { WranglerJsCompatWebpackPlugin } = require("wranglerjs-compat-webpack-plugin");\n`;

		config.plugins = config.plugins || [];
		// @ts-expect-error we replace this with `new WranglerJsCompatWebpackPlugin()`
		// after everything has been stringified
		config.plugins.push("REPLACE_ME");
	}

	stringified += `module.exports = ${toSource(config)}`.replace(
		'"REPLACE_ME"',
		"new WranglerJsCompatWebpackPlugin()"
	);

	fs.writeFileSync(path.resolve(filepath), stringified);
}
