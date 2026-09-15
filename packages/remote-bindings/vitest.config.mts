import { defineConfig, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";
import { embedWorkersPlugin } from "./scripts/embed-workers";

export default mergeConfig(
	configShared,
	defineConfig({
		plugins: [embedWorkersPlugin()],
	})
);
