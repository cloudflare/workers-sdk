import { defineConfig } from "vite-plus";

export default defineConfig({
	fmt: {
		useTabs: true,
		sortPackageJson: false,
		ignorePatterns: ["worker-configuration.d.ts"],
	},
	lint: {
		options: { typeAware: true, typeCheck: true },
		ignorePatterns: ["worker-configuration.d.ts"],
	},
});
