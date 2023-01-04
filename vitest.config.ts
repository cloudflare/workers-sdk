import { resolve } from "path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include:
			__dirname === process.cwd()
				? ["fixtures/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"]
				: configDefaults.include,
		exclude: [
			...configDefaults.exclude,
			resolve(__dirname, "fixtures/local-mode-tests/**/*"),
		],
		root: __dirname,
	},
});
