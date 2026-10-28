import { defineConfig } from "cf/config";
import config from "./cloudflare.config.ts";

// The same Worker, with the new module registry enabled
export default defineConfig({
	worker: {
		...config.worker,
		compatibilityFlags: [
			...config.worker.compatibilityFlags,
			"new_module_registry",
		],
	},
});
