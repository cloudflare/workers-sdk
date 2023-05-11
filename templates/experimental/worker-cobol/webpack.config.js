const { ProvidePlugin } = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
	mode: 'production',
	entry: './src/index.js',
	// devtool: "inline-source-map",
	node: {
		fs: 'empty',
	},
	plugins: [
		new CopyPlugin([
			//we need to manually copy this instead of requiring from
			//our script source code, since wasm files are bound to global scope
			//in workers, rather than being fetched like the browser.
			//wranglerjs also needs to see a wasm file in order for it to be sent to the api
			//correctly.
			{ from: './build/out.wasm', to: './worker/module.wasm' },
		]),
		new ProvidePlugin({
			TextDecoder: ['text-encoding', 'TextDecoder'],
			TextEncoder: ['text-encoding', 'TextEncoder'],
		}),
	],
};
