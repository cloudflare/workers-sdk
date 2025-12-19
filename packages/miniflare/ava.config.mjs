export default {
	files: ["test/**/*.spec.ts"],
	nodeArguments: ["--no-warnings", "--experimental-vm-modules"],
	require: ["./test/setup.mjs"],
	workerThreads: false,
	typescript: {
		compile: false,
		rewritePaths: {
			"test/": "dist/test/",
		},
	},
	environmentVariables: {
		MINIFLARE_ASSERT_BODIES_CONSUMED: "true",
	},
	concurrency: 1,
};
