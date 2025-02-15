import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared.js";

export default mergeConfig(
	configShared,
	defineProject({
		test: {
			include: ["tests/**.{test,spec}.{ts,js}"],
			globals: true,
			setupFiles: [import.meta.resolve("./crypto-polyfill.ts")],
		},
	})
);
