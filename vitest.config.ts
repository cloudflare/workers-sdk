import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include:
			__dirname === process.cwd()
				? [
						"{fixtures,packages/workers.new}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
				  ]
				: configDefaults.include,
		exclude: [...configDefaults.exclude],
		root: __dirname,
		testTimeout: 30_000,
	},
});
