import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: {
			index: "src/index.ts",
		},
		platform: "node",
		outDir: "dist",
		dts: true,
		tsconfig: "tsconfig.json",
		external: ["miniflare", /^@cloudflare\/workers-utils/],
	},
	{
		entry: {
			"proxy-worker": "templates/remoteBindings/ProxyServerWorker.ts",
		},
		platform: "neutral",
		outDir: "dist",
		dts: false,
		external: ["cloudflare:email", "cloudflare:workers"],
	},
	{
		entry: {
			"dev-proxy-worker": "templates/startDevWorker/ProxyWorker.ts",
		},
		platform: "node",
		outDir: "dist",
		dts: false,
	},
]);
