import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
	configShared,
	defineProject({
		test: {
			include: ["src/__tests__/**/*.{test,spec}.{ts,js}"],
		},
	})
);
