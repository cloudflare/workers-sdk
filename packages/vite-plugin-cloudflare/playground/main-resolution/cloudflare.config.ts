import { defineConfig } from "@cloudflare/vite-plugin/experimental-config";
import { nestedWorkerConfig } from "./nested-config/worker-config.ts";

export default defineConfig(({ mode }) => ({
	worker:
		mode === "nested-config"
			? nestedWorkerConfig
			: {
					name: "worker",
					entrypoint:
						mode === "package-export-main"
							? "@playground/main-resolution-package/entry"
							: mode === "virtual-module-main"
								? "virtual:entry"
								: "src/index.ts",
					compatibilityDate: "2024-12-30",
					...(mode === "package-export-main"
						? { compatibilityFlags: ["nodejs_compat"] }
						: {}),
				},
}));
