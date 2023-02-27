module.exports = (env) => {
	return {
		entry: { worker: ["./tmp/Worker.js"] },
		target: "webworker",
		output: {
			path: __dirname + "/worker",
		},
		mode: "production",
		resolve: {
			// See https://github.com/fable-compiler/Fable/issues/1490
			symlinks: false,
		},
		plugins: [],
		module: {
			rules: [],
		},
	};
};
