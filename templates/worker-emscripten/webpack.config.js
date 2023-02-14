const { resolve } = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const spawn = require('child_process').spawnSync;

module.exports = {
	entry: './index.js',
	output: {
		path: resolve(__dirname, 'build'),
		filename: 'index.js',
	},
	devtool: 'nosources-source-map',
	target: 'webworker',
	plugins: [
		{
			apply: compiler => {
				compiler.hooks.compilation.tap('emscripten-build', compilation => {
					let result = spawn('node', ['build.js'], { stdio: 'inherit' });

					if (result.status != 0) {
						compilation.errors.push('emscripten build failed');
					} else {
						console.log('emscripten build complete');
					}
				});
			},
		},
		new CopyPlugin([
			// we need to manually copy this instead of requiring from
			// our script source code, since wasm files are bound to global scope
			// in Workers, rather than being fetched like the browser.
			// wranglerjs also needs to see a wasm file in order for it to be sent to the api
			// correctly.
			{ from: './build/module.wasm', to: './worker/module.wasm' },
		]),
	],
	module: {
		rules: [
			// Emscripten JS files define a global. With `exports-loader` we can
			// load these files correctly (provided the global’s name is the same
			// as the file name).
			{
				test: /emscripten\.js$/,
				loader: 'exports-loader',
			},
		],
	},
};
