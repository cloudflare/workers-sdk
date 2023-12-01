import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		pool: "../..",
		poolOptions: {
			miniflare: {
				main: "./worker.ts",
				kvNamespaces: ["TEST_NAMESPACE"],
				compatibilityFlags: ["global_navigator"],
				durableObjects: {
					COUNTER: "Counter",
					OTHER: {
						className: "OtherObject",
						scriptName: "other",
					},
				},
				serviceBindings: {
					SELF: "",
				},
				workers: [
					{
						name: "other",
						// TODO(soon): probably want to resolve all these paths relative to
						//  this config file like `main`
						modules: true,
						scriptPath: path.join(__dirname, "other-worker.mjs"),
					},
				],
			},
		},
	},
});
