import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "misc-nodejs",
		// Pin a compatibility date from before `nodejs_compat` became enabled by
		// default, so that this fixture keeps covering the explicit-flag path.
		// Specifying the flag on a later date is a workerd validation error.
		compatibilityDate: "2025-12-02",
		compatibilityFlags: ["nodejs_compat"],
	},
});
