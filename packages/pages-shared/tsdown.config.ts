import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["asset-server/**/*.ts", "metadata-generator/**/*.ts"],
	format: "esm",
	platform: "neutral",
	fixedExtension: false,
	outExtensions: () => ({ js: ".js" }),
	sourcemap: true,
	dts: false,
	deps: { neverBundle: [/^(cloudflare|node):/] },
	// Each file is a published entry point, with paths relative to the package.
	unbundle: true,
	outputOptions: { preserveModulesRoot: "." },
});
