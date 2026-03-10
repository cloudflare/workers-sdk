import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
	configShared,
	defineProject({
		resolve: {
			alias: {
				// promjs has a broken package.json (main points to lib/index.js
				// which doesn't exist in the installed package). Alias it to the
				// actual entry point so Vite can resolve it in tests.
				promjs: path.resolve(__dirname, "node_modules/promjs/index.js"),
			},
		},
		test: {
			include: ["src/__tests__/**/*.{test,spec}.{ts,js}"],
		},
	})
);
