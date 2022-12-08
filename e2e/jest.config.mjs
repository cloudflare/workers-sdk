// @ts-check
/** @type {import('jest').Config} */
const config = {
	testRegex: ".*.(test|spec)\\.[jt]sx?$",
	testTimeout: 10_000,
	transform: {
		"^.+\\.c?(t|j)sx?$": ["esbuild-jest", { sourcemap: true }],
	},
	globalSetup: "./setup.ts",
	globalTeardown: "./teardown.ts",
};
export default config;
