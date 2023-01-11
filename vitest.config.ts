import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include:
			__dirname === process.cwd()
				? ["fixtures/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"]
				: configDefaults.include,
		exclude: [...configDefaults.exclude, "fixtures/local-mode-tests/**/*"],
		root: __dirname,
	},
});
