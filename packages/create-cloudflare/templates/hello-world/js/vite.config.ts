import { defineConfig } from "vite-plus";

export default defineConfig({
	fmt: {
		useTabs: true,
		sortPackageJson: false,
		ignorePatterns: [
			"node_modules/**",
			".wrangler/**",
			"dist/**",
			"worker-configuration.d.ts",
		],
	},
	lint: {
		options: { typeAware: false, typeCheck: false },
		ignorePatterns: [
			"node_modules/**",
			".wrangler/**",
			"dist/**",
			"worker-configuration.d.ts",
		],
	},
});
